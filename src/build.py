import pathlib, subprocess
d = pathlib.Path(__file__).resolve().parent
subprocess.run(['node','gen-profils.js'],cwd=str(d),check=True)
t = (d/'template.html').read_text(encoding='utf-8')
for k,f in [('ENGINE','engine.js'),('SILAE','silae.js'),('EXPORT','export-xlsx.js'),('PDF','export-pdf.js'),('TESTS','tests.js'),('CROISEMENT','croisement-data.js'),('PROFILS','profils-data.js'),('HISTORIQUE','historique.js'),('AIDE','aide.js'),('RETOURS','retours.js')]:
    t = t.replace('/*__%s__*/'%k, (d/f).read_text(encoding='utf-8'))
lb=(d/'livre-blanc.md').read_text(encoding='utf-8').replace('</','<\\/')
import json
t=t.replace('/*__LIVREBLANC__*/', 'const LIVREBLANC = '+json.dumps(lb,ensure_ascii=False)+';')
v,dt=(d/'version.txt').read_text(encoding='utf-8').strip().split('|')
t=t.replace('__APP_VERSION__',v).replace('__APP_DATE__',dt)
(d/'index.html').write_text(t, encoding='utf-8'); print('index.html', len(t), 'octets')
