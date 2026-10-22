import json, sys, time
from playwright.sync_api import sync_playwright
state = open('test/stuck-win.json').read().strip()
out = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch()
    errors = []
    def page_for(init, scheme='dark'):
        ctx = b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, color_scheme=scheme)
        ctx.add_init_script(init)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.on('pageerror', lambda e: errors.append(str(e)))
        return pg
    # 1. Fresh start: a deal appears, no stuck sheet.
    pg = page_for("try{localStorage.clear()}catch(e){}")
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(2500)
    print('fresh: stuck hidden =', pg.locator('#stuck').is_hidden(), '| cards =', pg.locator('.card').count())
    pg.screenshot(path=f'{out}/fresh.png')
    # tap stock a few times, then undo
    for _ in range(3): pg.locator('.slot.stock').click(position={'x': 10, 'y': 10}, force=True); pg.wait_for_timeout(300)
    print('after draws moves =', pg.locator('#moves').inner_text())
    # 2. Saved stuck game, verdict not known yet -> sheet opens, worker answers.
    pg = page_for("localStorage.clear(); localStorage.setItem('klondike-v1', %s);" % json.dumps(state))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_timeout(1500)
    print('stuck: sheet visible =', pg.locator('#stuck').is_visible(), '| verdict =', pg.locator('#verdict').get_attribute('data-v'))
    t0 = time.time()
    pg.wait_for_function("document.getElementById('verdict').dataset.v !== 'pending'", timeout=120000)
    print('verdict after %.1fs =' % (time.time() - t0), pg.locator('#verdict').get_attribute('data-v'), '|', pg.locator('#verdictText').inner_text())
    pg.screenshot(path=f'{out}/stuck-win.png')
    pg.click('#stClose'); pg.wait_for_timeout(400)
    print('after close hidden =', pg.locator('#stuck').is_hidden())
    pg.click('#btnHint'); pg.wait_for_timeout(400)
    print('hint reopens =', pg.locator('#stuck').is_visible())
    pg.click('#stRestart'); pg.wait_for_timeout(2500)
    print('restart: deal =', pg.evaluate("JSON.parse(localStorage.getItem('klondike-v1')).seed"), '| moves =', pg.locator('#moves').inner_text(), '| stuck hidden =', pg.locator('#stuck').is_hidden())
    # 3. Same stuck game with a cached "lose" verdict, light scheme.
    seed = json.loads(state)['seed']; draw = json.loads(state)['draw']
    pg = page_for("localStorage.clear(); localStorage.setItem('klondike-v1', %s); localStorage.setItem('klondike-verdicts-v1', JSON.stringify({'%s:%s':'lose'}));" % (json.dumps(state), seed, draw), 'light')
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1500)
    print('lose verdict =', pg.locator('#verdict').get_attribute('data-v'))
    pg.screenshot(path=f'{out}/stuck-lose.png')
    print('errors:', errors)
    b.close()
