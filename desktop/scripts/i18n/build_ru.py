# Собирает src/i18n/ru.ts из strings.ru.tsv и templates.ru.tsv: python3 scripts/i18n/build_ru.py
import html, json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
def norm(s):
    s = html.unescape(s).replace(' ',' ')
    return re.sub(r'\s+',' ',s).strip()
# Строки закрытых функций (Bestie/Chief) в OSS-сборку попадать не должны —
# build-protected-feature-artifacts.mjs это проверяет.
PROTECTED = re.compile(r'\bbestie\b|chief of staff|builtin:bestie|always close at hand', re.I)
strings = {}
for line in open('strings.ru.tsv',encoding='utf-8'):
    en, ru = line.rstrip('\n').split('\t')
    k, v = norm(en), norm(ru)
    if not k or k == v or PROTECTED.search(k) or PROTECTED.search(v): continue
    strings[k] = v
manual = {
 "{} channel member{}": "Участников канала: {0}",
 "Huddle active — {} participant{}": "Идёт созвон — участников: {0}",
 "Imported {} with {} member{}.": "Импортировано: {0}, участников: {1}.",
 "Join active huddle ({} participant{})": "Подключиться к созвону (участников: {0})",
}
templates = []
for line in open('templates.ru.tsv',encoding='utf-8'):
    en, ru = line.rstrip('\n').split('\t')
    en_n, ru_n = norm(en), norm(ru)
    if PROTECTED.search(en_n) or PROTECTED.search(ru_n): continue
    if en_n == ru_n or not re.search(r'[A-Za-z]{2}', en_n.replace('{}','')): continue
    if en_n in manual: ru_n = manual[en_n]
    else:
        i = iter(range(20)); ru_n = re.sub(r'\{\}', lambda m: '{%d}' % next(i), ru_n)
    templates.append([en_n, ru_n])
templates.sort(key=lambda t: -len(t[0].replace('{}','')))  # самые специфичные первыми
out = ['// Русский словарь интерфейса Buzz Desktop (Pride-Automatics).',
 '// Ключ — английский текст как в DOM (пробелы схлопнуты). Обновлять:',
 '//   node scripts/i18n/extract-ui-strings.mjs --missing',
 '// и дописать недостающее. Шаблоны: {} в ключе — любая подстановка, {0},{1} в переводе — её значения.',
 '', 'export const RU_STRINGS: Record<string, string> = {']
for k,v in sorted(strings.items()):
    out.append(f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},')
out += ['};', '', 'export const RU_TEMPLATES: ReadonlyArray<readonly [string, string]> = [']
for k,v in templates:
    out.append(f'  [{json.dumps(k, ensure_ascii=False)}, {json.dumps(v, ensure_ascii=False)}],')
out += ['];', '']
open('../../src/i18n/ru.ts','w',encoding='utf-8').write('\n'.join(out))
print(len(strings), len(templates))
