// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoTags, classify, decodeEntities, isRelevant, ogImage, parseFeed, parseTelegram, shorten } from "./feeds";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Economist.kg</title><link>https://economist.kg</link>
<item>
  <title><![CDATA[ГНС обновила форму отчёта по НДС &laquo;STI-091&raquo;]]></title>
  <link>https://economist.kg/novosti/2026/11/10/nds-forma/</link>
  <pubDate>Tue, 10 Nov 2026 09:15:00 +0000</pubDate>
  <category><![CDATA[Налоги]]></category>
  <guid isPermaLink="false">https://economist.kg/?p=28700</guid>
  <description><![CDATA[<p>Налоговая служба опубликовала новую форму отчёта. Изменения касаются плательщиков НДС с 1 января 2027 года.</p>]]></description>
  <content:encoded><![CDATA[<p><img src="/wp-content/uploads/2026/11/nds.jpg" alt=""/></p><p>Полный текст…</p>]]></content:encoded>
</item>
<item>
  <title>Кабмин утвердил положение о государственных закупках</title>
  <link>https://24.kg/ofitsialno/400001_utverjdeno/</link>
  <pubDate>Wed, 11 Nov 2026 05:00:00 +0600</pubDate>
  <enclosure url="https://24.kg/files/media/400/400001.jpg" type="image/jpeg" length="1000"/>
  <description>Постановление вступает в силу через 10 дней.</description>
</item>
<item><title></title><link>https://x.kg/empty</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>IFRS news</title>
  <entry>
    <id>tag:ifrs.org,2026:news-18</id>
    <title type="html">IASB publishes amendments to IFRS 18</title>
    <link rel="alternate" href="https://www.ifrs.org/news/2026/11/ifrs-18/"/>
    <link rel="enclosure" href="https://www.ifrs.org/file.pdf"/>
    <updated>2026-11-05T10:00:00Z</updated>
    <summary>The amendments clarify presentation of operating profit.</summary>
    <media:thumbnail url="https://www.ifrs.org/img/18.png"/>
    <category term="IFRS 18"/>
  </entry>
</feed>`;

const TG = `<html><body><section class="tgme_channel_history js-message_history">
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="NBKR_news/1201" data-view="x">
  <div class="tgme_widget_message_bubble">
    <a class="tgme_widget_message_photo_wrap 12 34" href="https://t.me/NBKR_news/1201" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/abc.jpg')"></a>
    <div class="tgme_widget_message_text js-message_text" dir="auto">📢 <b>Национальный банк сохранил учетную ставку на уровне 9,25%</b><br/><br/>Правление НБКР приняло решение <a href="https://www.nbkr.kg">подробнее</a>. #НБКР<div class="tgme_widget_message_text_more">x</div></div>
    <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/NBKR_news/1201"><time datetime="2026-11-10T08:00:00+00:00" class="time">14:00</time></a></div>
  </div></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="NBKR_news/1202">
  <div class="tgme_widget_message_bubble"><div class="tgme_widget_message_text js-message_text" dir="auto">Официальные курсы валют на 12 ноября&#33; Доллар США — 87,45 сома.</div>
  <a class="tgme_widget_message_date"><time datetime="2026-11-11T09:00:00+00:00"></time></a></div></div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="NBKR_news/1203"><div class="tgme_widget_message_bubble"><a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn4.telesco.pe/file/z.jpg')"></a></div></div></div>
</section></body></html>`;

test("ленты: RSS — заголовок, ссылка, картинка из текста и из enclosure, дата, рубрики", () => {
  const items = parseFeed(RSS, "https://economist.kg/feed/");
  assert.equal(items.length, 2, "пустой заголовок пропускается");
  const [a, b] = items;
  assert.equal(a.title, "ГНС обновила форму отчёта по НДС «STI-091»");
  assert.equal(a.url, "https://economist.kg/novosti/2026/11/10/nds-forma/");
  assert.equal(a.id, "https://economist.kg/?p=28700");
  assert.equal(a.image, "https://economist.kg/wp-content/uploads/2026/11/nds.jpg");
  assert.equal(a.date, "2026-11-10T09:15:00.000Z");
  assert.deepEqual(a.categories, ["Налоги"]);
  assert.match(a.summary, /^Налоговая служба опубликовала/);
  assert.equal(b.image, "https://24.kg/files/media/400/400001.jpg");
  assert.equal(b.date, "2026-11-10T23:00:00.000Z");
  assert.equal(classify(b.title, b.url, "news"), "regulation");
});

test("ленты: Atom — ссылка alternate, миниатюра, рубрика term", () => {
  const [e] = parseFeed(ATOM, "https://www.ifrs.org/");
  assert.equal(e.url, "https://www.ifrs.org/news/2026/11/ifrs-18/");
  assert.equal(e.image, "https://www.ifrs.org/img/18.png");
  assert.deepEqual(e.categories, ["IFRS 18"]);
  assert.equal(e.id, "tag:ifrs.org,2026:news-18");
});

test("ленты: Telegram-канал — сообщения с текстом, картинкой, ссылкой на пост", () => {
  const items = parseTelegram(TG, "NBKR_news");
  assert.equal(items.length, 2, "фото без подписи пропускается");
  const [last, first] = items;
  assert.equal(first.id, "NBKR_news/1201");
  assert.equal(first.url, "https://t.me/NBKR_news/1201");
  assert.equal(first.title, "Национальный банк сохранил учетную ставку на уровне 9,25%");
  assert.equal(first.image, "https://cdn4.telesco.pe/file/abc.jpg");
  assert.equal(first.date, "2026-11-10T08:00:00.000Z");
  assert.ok(first.categories.includes("НБКР"));
  assert.match(first.summary, /^Правление НБКР приняло решение подробнее/);
  assert.equal(last.title, "Официальные курсы валют на 12 ноября! Доллар США — 87,45 сома.");
  assert.equal(last.summary, "", "анонс не повторяет заголовок");
  assert.equal(last.image, null);
});

test("ленты: темы, отбор, вид публикации, сокращение", () => {
  assert.deepEqual(autoTags("НБКР сохранил учетную ставку; курс доллара"), ["НБКР", "учетнаяставка", "курсы"]);
  assert.ok(autoTags("ГНС напоминает о сроке сдачи ЭСФ").includes("ЭСФ"));
  assert.ok(isRelevant("Изменения в Налоговый кодекс"));
  assert.ok(!isRelevant("В Бишкеке пройдёт концерт"));
  assert.equal(classify("Подписан Закон «О внесении изменений в Налоговый кодекс»", "https://x", "news"), "law");
  assert.equal(classify("Приглашаем на конференцию по МСФО", "https://x", "news"), "event");
  assert.equal(classify("Что угодно", "https://x", "article"), "article");
  assert.equal(shorten("Первое предложение здесь. Второе предложение длиннее и не влезет", 40), "Первое предложение здесь.");
  assert.equal(decodeEntities("&#1053;&#x411; &amp; &laquo;x&raquo;"), "НБ & «x»");
  assert.equal(ogImage(`<head><meta content="/i/a.png" property="og:image"></head>`, "https://a.kg/news/1"), "https://a.kg/i/a.png");
});
