import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { closeAll, loadPage } from '../../tests/harness.ts'

after(closeAll)

const order = (page: ReturnType<typeof loadPage>) => page.$$('[data-works-list] > [data-work]').map((li) => li.dataset.name)

test('without the script the list is newest first and the sort control stays hidden', () => {
  const page = loadPage('works/index.html', 'works/')
  assert.deepEqual(order(page), ['Bayline', 'Enamel', 'Usual'])
  assert.equal(page.$('[data-works-sort]').hidden, true)
})

test('the sort control is a labelled radio group that reorders the cards and says so', async () => {
  const page = loadPage('works/index.html', 'works/')
  assert.deepEqual(page.boot(), [])
  const control = page.$<HTMLFieldSetElement>('[data-works-sort]')
  assert.equal(control.hidden, false, 'shown once the script runs')
  assert.equal(control.querySelector('legend')!.textContent, 'Sort')
  const radio = (value: string) => page.$<HTMLInputElement>(`input[name="sort"][value="${value}"]`)
  assert.ok(radio('newest').checked)

  radio('oldest').click()
  assert.deepEqual(order(page), ['Usual', 'Bayline', 'Enamel'])
  await page.wait()
  assert.equal(page.$('[data-works-status]').textContent, 'Showing oldest first.')

  radio('name').click()
  assert.deepEqual(order(page), ['Bayline', 'Enamel', 'Usual'])
  await page.wait()
  assert.equal(page.$('[data-works-status]').textContent, 'Showing by name, A to Z.')

  radio('newest').click()
  assert.deepEqual(order(page), ['Bayline', 'Enamel', 'Usual'])
  const links = page.$$<HTMLAnchorElement>('[data-works-list] a').map((a) => a.getAttribute('href'))
  assert.deepEqual(links, ['/marque/works/bayline/', '/marque/works/enamel/', '/marque/works/usual/'], 'each card still opens its own page')
})
