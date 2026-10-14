import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from app import main, google_routes as google


def message(subject, body, mime='text/plain', message_id='receipt'):
    return {'id':message_id,'snippet':body[:100],'payload':{'mimeType':mime,
        'headers':[{'name':'Subject','value':subject},{'name':'From','value':'Avisos <avisos@example.com>'}],
        'body':{'data':base64.urlsafe_b64encode(body.encode()).decode()}}}


class GmailConsumptionFilter(unittest.TestCase):
    def test_accepts_completed_consumptions(self):
        for subject,body,expected in [
            ('Notificación de consumo','Realizaste un consumo por S/ 6.00 en TIENDA.',600),
            ('Compra aprobada','Importe: PEN 1,234.56. Comercio: TIENDA.',123456),
            ('Comprobante de tu compra','Total: S/. 12,50. Gracias por tu compra.',1250),
            ('Aviso de tarjeta','Se ha realizado una compra de S/ 27.90 en TIENDA.',2790),
            ('Pago exitoso','Importe: S/ 18.00 en RESTAURANTE.',1800)]:
            with self.subTest(subject=subject):
                result=google.consumption(message(subject,body))
                self.assertIsNotNone(result)
                self.assertEqual(result['amount_cents'],expected)

    def test_rejects_the_campaigns_shown_in_the_user_screenshot(self):
        for subject,body in [
            ('¡SOLO POR HOY - POWER BI EN IDAT! + CERTIFICADO GRATIS','60% DCTO + MATRÍCULA GRATIS. S/176 – PAGO ÚNICO'),
            ('Estas empresas necesitan talento como tú: Postúlate ahora','Manpower ha publicado nuevas ofertas de empleo. Compra S/10.'),
            ('Te aceptaron','¡Felicidades! Obtén tu regalo de S/80 ahora!'),
            ('Nuevas vacantes listas para dar tu próximo paso','Lista de empleos con pago mensual S/1500'),
            ('Oferta: compra confirmada de cursos','Compra realizada por S/100. Descuento por hoy.')]:
            with self.subTest(subject=subject):
                self.assertIsNone(google.consumption(message(subject,body)))

    def test_rejects_non_consumptions_and_unsuccessful_operations(self):
        for subject,body in [
            ('Transferencia realizada','Pago exitoso por S/80'),
            ('Pago exitoso','Has realizado una transferencia por S/80'),
            ('Transacción aprobada','Transferencia confirmada por S/80'),
            ('Pago de tu tarjeta realizado','Pago realizado por S/100'),
            ('Retiro realizado','Transacción aprobada por S/50'),
            ('Abono en tu cuenta','Pago registrado por S/200'),
            ('Recordatorio de pago','Tu compra de S/40 está por vencer'),
            ('Compra rechazada','Tu compra de S/60 fue rechazada'),
            ('Compra','No se realizó tu compra por S/25'),
            ('Compra pendiente','Comprobante de tu compra por S/25'),
            ('Compra aprobada','Tu compra fue anulada. S/25'),
            ('Estado de cuenta','Consumo registrado S/20'),
            ('Promoción bancaria','Tu consumo aprobado genera cashback S/10')]:
            with self.subTest(subject=subject):
                self.assertIsNone(google.consumption(message(subject,body)))

    def test_requires_confirmed_operation_and_amount_in_soles(self):
        for subject,body in [('Compra','Paga solo S/20 por este producto'),('Compra aprobada','Importe USD 20'),('Compra aprobada','Gracias por tu compra'),('Compra aprobada','Saldo disponible: PEN 500.00')]:
            self.assertIsNone(google.consumption(message(subject,body)))

    def test_reads_html_body_when_snippet_does_not_contain_the_amount(self):
        item=message('Aviso de consumo','<style>.x {color:red}</style><p>Has realizado un consumo</p><table><tr><td>Importe:</td><td>S/ 35.90</td></tr></table>','text/html')
        item['snippet']='Hola, te enviamos el detalle de tu operación.'
        self.assertEqual(google.consumption(item)['amount_cents'],3590)

    def test_accepts_receipt_with_promotional_footer(self):
        item=message('Compra aprobada','Realizaste una compra por S/15.00. Descubre las promociones y descuentos para futuras compras.')
        self.assertEqual(google.consumption(item)['amount_cents'],1500)

    def test_ignores_attachment_and_prefers_plain_alternative(self):
        item=message('Compra aprobada','')
        item['snippet']='Aviso'
        item['payload'].update({'mimeType':'multipart/alternative','parts':[
            message('', 'Compra aprobada S/10')['payload'],
            message('', '<p>Compra aprobada S/999</p>','text/html')['payload']]})
        self.assertEqual(google.consumption(item)['amount_cents'],1000)
        attached=message('Compra aprobada','Compra aprobada S/100')
        attached['payload']['filename']='receipt.txt'
        attached['snippet']='Aviso'
        self.assertIsNone(google.consumption(attached))


class GmailConsumptionEndpoints(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db_patch=patch.object(main,'DB',Path(self.tmp.name)/'db.sqlite3')
        self.db_patch.start()
        main.init_finance_db()
        self.account=main.add_account(main.AccountIn(name='Banco',kind='bank',opening_cents=10000))
        self.key_patch=patch.object(google,'gmail_key',side_effect=lambda value:'mailbox:'+value)
        self.creds_patch=patch.object(google,'credentials',return_value=object())
        self.key_patch.start();self.creds_patch.start()
        self.service=MagicMock()
        self.api=self.service.users.return_value.messages.return_value
        self.build_patch=patch('googleapiclient.discovery.build',return_value=self.service)
        self.build_patch.start()

    def tearDown(self):
        self.build_patch.stop();self.creds_patch.stop();self.key_patch.stop();self.db_patch.stop();self.tmp.cleanup()

    def test_lists_only_receipts_and_checks_the_next_page(self):
        self.api.list.return_value.execute.side_effect=[{'messages':[{'id':'ad'}],'nextPageToken':'next'}, {'messages':[{'id':'receipt'}]}]
        records={'ad':message('Regalo S/80','Obtén un regalo S/80',message_id='ad'),'receipt':message('Compra aprobada','Importe S/6',message_id='receipt')}
        self.api.get.side_effect=lambda **args:MagicMock(execute=lambda:records[args['id']])
        response=google.suggestions()
        self.assertEqual([r['gmail_id'] for r in response['suggestions']],['receipt'])
        self.assertEqual(self.api.list.call_args.kwargs['pageToken'],'next')
        self.assertEqual(self.api.get.call_args.kwargs['format'],'full')
        self.assertIn('-category:promotions',self.api.list.call_args.kwargs['q'])

    def test_rejects_importing_an_ad_even_if_called_directly(self):
        self.api.get.return_value.execute.return_value=message('Regalo gratis','Obtén S/80 ahora')
        with self.assertRaises(HTTPException) as error:
            google.import_expense(google.GmailImportIn(gmail_id='ad',account_id=self.account['id'],amount_cents=8000,concept='Regalo'))
        self.assertEqual(error.exception.status_code,400)
        self.assertEqual(main.get_movements(),[])
        self.assertEqual(main.get_accounts()[-1]['balance_cents'],10000)

    def test_imports_a_consumption_once_without_rechecking_an_imported_message(self):
        self.api.get.return_value.execute.return_value=message('Consumo aprobado','Importe S/6')
        payload=google.GmailImportIn(gmail_id='receipt',account_id=self.account['id'],amount_cents=600,concept='Compra')
        first=google.import_expense(payload)
        second=google.import_expense(payload)
        self.assertEqual(first['id'],second['id'])
        self.assertTrue(second['already_imported'])
        self.assertEqual(self.api.get.call_count,1)
        self.assertEqual(main.get_accounts()[-1]['balance_cents'],9400)
