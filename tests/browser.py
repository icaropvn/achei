"""Jornada no navegador contra a aplicação e o PostgreSQL iniciados pela integração."""
import os
from playwright.sync_api import sync_playwright, expect

base = os.environ['APP_ORIGIN']
with sync_playwright() as pw:
    binary = os.getenv('CHROMIUM_PATH')
    browser = pw.chromium.launch(**({'executable_path': binary, 'args': ['--no-sandbox']} if binary else {}))
    u = browser.new_page(viewport={'width': 360, 'height': 800})
    a = browser.new_page(viewport={'width': 1280, 'height': 900})
    def login(p, email, password):
        p.goto(base + '/entrar')
        p.get_by_label('E-mail').fill(email)
        p.get_by_label('Senha', exact=True).fill(password)
        p.get_by_role('button', name='Entrar', exact=True).click()
        p.wait_for_url(base + '/')
    login(u, 'ana@example.test', 'fixture-password-user')
    u.get_by_label('Buscar instituição ou cidade').fill('Horizonte')
    expect(u.get_by_role('link', name='Instituto Horizonte', exact=False)).to_be_visible()
    u.goto(base+'/perdas/nova?instituicao=horizonte')
    u.get_by_label('Categoria').select_option('Chaves')
    u.get_by_label('Perdi a partir de').fill('2026-11-10')
    u.get_by_label('Até aproximadamente').fill('2026-11-12')
    u.get_by_role('button', name='Salvar e buscar').click()
    u.wait_for_url('**/buscas')
    assert u.evaluate('document.documentElement.scrollWidth') <= 360

    login(a, 'a@example.test', 'fixture-new-password')
    a.goto(base+'/institucional/objetos/novo')
    a.get_by_label('Categoria').select_option('Chaves')
    a.get_by_label('Data de encontro').fill('2026-11-12')
    for field,value in [
        ('Resumo público','Chaves da biblioteca'),('Local geral','Biblioteca'),
        ('Descrição autenticada','Chaves em argola'),('Características reservadas','Fita rosa'),
        ('Localização de guarda','Gaveta 1'),
    ]: a.get_by_label(field).fill(value)
    a.get_by_role('button', name='Salvar', exact=False).click()
    a.wait_for_url('**/institucional/objetos')
    u.goto(base+'/notificacoes')
    u.get_by_role('button',name='Ver possível item').first.click()
    expect(u.get_by_role('heading',name='Chaves da biblioteca')).to_be_visible()
    u.locator('a[href*="/solicitar"]').click()
    u.get_by_label('Descrição para a instituição').fill('Há uma fita rosa na argola.')
    u.get_by_role('button',name='Enviar solicitação').click()
    u.wait_for_url('**/solicitacoes/*')
    claim_url=u.url
    a.goto(base+'/institucional'+claim_url.removeprefix(base))
    a.get_by_role('button',name='Aprovar e orientar retirada').click()
    a.get_by_role('dialog').locator('button.btn:not(.secondary)').last.click()
    a.get_by_role('button',name='Confirmar entrega').click()
    dialog=a.get_by_role('dialog')
    dialog.get_by_role('checkbox').check()
    dialog.locator('button.btn:not(.secondary)').last.click()
    expect(a.get_by_text('Entrega física registrada. Objeto devolvido.',exact=True)).to_be_visible()
    u.reload()
    expect(u.get_by_text('Concluída',exact=True).first).to_be_visible()
    print('Navegador: perda, novo achado, aviso, solicitação, aprovação e entrega aprovados.')
    browser.close()
