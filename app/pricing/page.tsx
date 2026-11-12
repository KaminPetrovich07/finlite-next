import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { OPERATOR } from "@/lib/legal";

export const metadata = { title: "Тарифы — FinLite KG" };

const money = (n: number) => n.toLocaleString("ru-RU");

export default function PricingPage() {
  const plans = PLAN_ORDER.map((k) => PLANS[k]).filter((p) => p.public);
  const contact = OPERATOR.email || OPERATOR.telegram;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Тарифы</h1>
      <p className="mt-2 max-w-3xl text-sm text-fl-cream/65">
        Цены в сомах. Оплата по счёту безналичным переводом; при оплате за год — два месяца бесплатно. Тариф подключает
        администратор после оплаты, данные при смене тарифа сохраняются. Если оплата закончилась, компании и проводки
        остаются — работа продолжается на бесплатном тарифе.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((p) => {
          const featured = p.key === "max";
          return (
            <section key={p.key} className={`flex flex-col rounded-2xl border bg-fl-charcoal-2 p-5 shadow-card ${featured ? "border-fl-gold" : "border-fl-line"}`}>
              <h2 className="font-display text-xl font-bold text-fl-cream">{p.name}</h2>
              <p className="mt-1 min-h-[2.5rem] text-xs text-fl-cream/55">{p.tagline}</p>
              <p className="num mt-3 font-display text-3xl font-bold text-fl-cream">
                {money(p.priceKgs)}<span className="ml-1 text-sm font-medium text-fl-cream/55">сом / мес.</span>
              </p>
              <p className="num mt-0.5 h-4 text-xs text-fl-cream/50">{p.priceYearKgs ? `${money(p.priceYearKgs)} сом за год` : ""}</p>
              {p.audience && <p className="mt-2 rounded-md bg-fl-gold/10 px-2 py-1 text-xs text-fl-gold">{p.audience}</p>}
              <ul className="mt-4 flex-1 space-y-2 text-sm text-fl-cream/80">
                {p.bullets.map((f) => <li key={f} className="flex gap-2"><span className="text-fl-gold">✓</span><span>{f}</span></li>)}
              </ul>
              <a href={p.key === "free" ? "/register" : "/account"} className={`mt-5 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${featured ? "bg-fl-accent text-fl-on-accent hover:bg-fl-accent-hover" : "border border-fl-line text-fl-cream hover:border-fl-gold/40"}`}>
                {p.key === "free" ? "Начать бесплатно" : "Подключить"}
              </a>
            </section>
          );
        })}
      </div>

      <section className="mt-8 rounded-xl border border-fl-line bg-fl-charcoal-2 p-5 text-sm text-fl-cream/75">
        <h2 className="font-display text-lg font-semibold text-fl-cream">Как считались цены</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>«Про» стоит как одна-две консультации бухгалтера в месяц и заменяет ручной перенос выписок и сверку.</li>
          <li>«Макс» — на 10 компаний: для аутсорс-бухгалтера это 249 сом за компанию в месяц.</li>
          <li>«Премиум» — для организаций, которым нужны отраслевые формы и нормативы; без ограничения проводок и с обучением команды.</li>
          <li>«Наука» — по цене чашки кофе в неделю, чтобы студенты и преподаватели могли работать на реальных данных.</li>
        </ul>
      </section>

      <p className="mt-6 text-sm text-fl-cream/60">
        Для подключения платного тарифа {contact ? <>напишите: {OPERATOR.email && <a className="text-fl-gold underline" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>}{OPERATOR.email && OPERATOR.telegram ? " или " : ""}{OPERATOR.telegram}</> : "напишите через кнопку «Отзыв» в меню"} — укажите e-mail аккаунта и реквизиты для счёта.
        Для тарифа «Наука» приложите подтверждение статуса. Для пилотных компаний действует бесплатный тариф «Пилот».
      </p>
    </main>
  );
}
