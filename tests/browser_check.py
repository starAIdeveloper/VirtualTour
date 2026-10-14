"""Production browser checks. Build first; optional CHROMIUM_PATH chooses a browser."""
import os,json,pathlib,subprocess,time,atexit,io,socket
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=pathlib.Path(__file__).resolve().parents[1]
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
server=subprocess.Popen(['python','-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(root/'dist')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
atexit.register(server.terminate);time.sleep(.4)
def shot(page,name):
 Image.open(io.BytesIO(page.screenshot(full_page=True))).save(root/'docs/screenshots'/(name+'.webp'),quality=65)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or None,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1600,'height':1100},accept_downloads=True);page.set_default_timeout(15000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{port}');page.wait_for_function("document.querySelector('#viewport canvas')!==null");page.wait_for_timeout(1500)
 shot(page,'dashboard')
 page.locator('[data-action=open-tour]').click();assert page.evaluate('virtualTourDiagnostics().page')=='Virtual Tour Player'
 before=page.evaluate('virtualTourDiagnostics().view.yaw');page.locator('[data-action=right]').click();assert page.evaluate('virtualTourDiagnostics().view.yaw')>before
 page.locator('[data-action=left]').click();page.locator('[data-action=zoom-in]').click();assert page.evaluate('virtualTourDiagnostics().view.fov')<70
 page.locator('.hotspot.information').click();expect(page.locator('aside')).to_contain_text('The Armillary')
 page.locator('[data-scene=suite]').click();assert page.evaluate('virtualTourDiagnostics().current')=='suite';page.wait_for_timeout(900)
 shot(page,'player')
 with page.expect_download() as d:page.locator('[data-action=capture]').click()
 assert d.value.suggested_filename.endswith('.png')
 page.locator('nav button').filter(has_text='Tours').click();page.locator('[data-action=add-scene]').click();page.locator('[name=name]').fill('Test Gallery');page.locator('[name=description]').fill('Browser-created scene');page.locator('dialog button[type=submit]').click();assert page.evaluate('virtualTourDiagnostics().scenes')==5
 new_id=page.evaluate('virtualTourDiagnostics().current')
 page.locator('[data-action=add-hotspot]').click();page.locator('[name=label]').fill('Test Information');page.locator('[name=kind]').select_option('info');page.locator('[name=text]').fill('A saved information hotspot');page.locator('[name=yaw]').fill('12.5');page.locator('dialog button[type=submit]').click();assert page.evaluate('virtualTourDiagnostics().hotspots')==1
 page.locator('[data-action=set-start]').click();assert page.evaluate('virtualTourDiagnostics().start')==new_id
 page.reload();assert page.evaluate('virtualTourDiagnostics().current')==new_id;assert page.evaluate('virtualTourDiagnostics().scenes')==5
 page.locator('nav button').filter(has_text='Tours').click();page.locator('[data-action=place-hotspot]').click();box=page.locator('#viewport canvas').bounding_box();page.mouse.click(box['x']+box['width']*.3,box['y']+box['height']*.5);page.locator('[name=label]').fill('Placed Link');page.locator('dialog button[type=submit]').click();assert page.evaluate('virtualTourDiagnostics().hotspots')==2
 shot(page,'editor')
 page.locator('nav button').filter(has_text='Navigation Map').click();page.locator('[data-action=edit-map]').click();marker=page.locator(f'[data-map="{new_id}"]');box=marker.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+10);page.mouse.down();page.mouse.move(box['x']+box['width']/2+45,box['y']+55,steps=5);page.mouse.up();page.locator('[data-action=edit-map]').click()
 shot(page,'map')
 page.locator('nav button').filter(has_text='Panorama Stitching').click();page.locator('[data-action=sample-images]').click();assert page.evaluate('virtualTourDiagnostics().images')==2
 page.locator('[data-action=process]').click();page.wait_for_function('!virtualTourDiagnostics().busy');assert page.evaluate('virtualTourDiagnostics().matches')>2
 with page.expect_download() as d:page.locator('[data-action=export-blend]').click()
 assert d.value.suggested_filename.endswith('.png');assert d.value.path().stat().st_size>1000
 shot(page,'stitching')
 page.locator('nav button').filter(has_text='CV Processing').click();assert page.locator('#match-canvas').count()==1
 page.locator('nav button').filter(has_text='Analytics').click();assert page.evaluate('virtualTourDiagnostics().events')>4
 with page.expect_download() as d:page.locator('[data-action=events-csv]').click()
 assert d.value.suggested_filename.endswith('.csv')
 shot(page,'analytics')
 page.locator('nav button').filter(has_text='Settings').click();page.wait_for_function("[...document.querySelectorAll('.reference-grid img')].every(i=>i.complete&&i.naturalWidth>0)")
 with page.expect_download() as d:page.locator('[data-action=export-project]').click()
 backup=d.value.path();assert json.loads(backup.read_text())['project']['start']==new_id
 page.locator('#project-upload').set_input_files(backup);expect(page.locator('#toast')).to_contain_text('restored')
 page.locator('#project-upload').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"project":{"version":999},"panoramas":{}}'});expect(page.locator('#toast')).to_contain_text('rejected')
 page.locator('nav button').filter(has_text='Tours').click()
 buf=io.BytesIO();im=Image.new('RGB',(800,400),(60,140,180));im.save(buf,format='PNG')
 page.locator('#panorama-upload').set_input_files({'name':'panorama.png','mimeType':'image/png','buffer':buf.getvalue()});expect(page.locator('#toast')).to_contain_text('panorama loaded');assert page.evaluate('virtualTourDiagnostics().panoramas')==1
 page.locator('nav button').filter(has_text='Settings').click()
 with page.expect_download() as d:page.locator('[data-action=export-project]').click()
 full=d.value.path();assert len(json.loads(full.read_text())['panoramas'])==1
 page.locator('#project-upload').set_input_files(full);expect(page.locator('#toast')).to_contain_text('restored');assert page.evaluate('virtualTourDiagnostics().panoramas')==1
 page.locator('nav button').filter(has_text='Tours').click();page.once('dialog',lambda d:d.accept());page.locator('[data-action=delete-scene]').click();assert page.evaluate('virtualTourDiagnostics().scenes')==4;assert page.evaluate('virtualTourDiagnostics().panoramas')==0
 page.set_viewport_size({'width':390,'height':844});page.locator('nav button').filter(has_text='Dashboard').click();page.wait_for_timeout(400);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 shot(page,'mobile')
 assert not errors,errors
 (root/'docs/browser-report.json').write_text(json.dumps({'passed':True,'checks':['built WebGL room rendering','player turning/zoom','information hotspot','scene navigation','viewport PNG capture','scene creation','hotspot editing/placement','start scene persistence','map dragging','worker processing/feature matches','blend PNG export','CV diagnostics','local analytics CSV','built reference assets','project backup/restore/rejection','panorama upload','embedded panorama backup roundtrip','scene deletion','mobile layout'],'pageErrors':errors},indent=2))
 browser.close();print('Browser checks passed')
