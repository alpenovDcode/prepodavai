# Tutor Exchange — Stage 6: Polish + Rollout

**Goal:** Финальная полировка перед бета-релизом: mobile-раскладка `DialogRoom`, логирование критичных action-ов, дефолтное сообщение отключённого инструмента, smoke-чек-лист и переключение флага для бета-репетиторов.

**Architecture:** Без новых сущностей — только правки UI, добавление `Logger.log` в `DialogActionsService`, docs.

## Global Constraints

- Mobile-layout: при `md:` (< 768px) `DialogRoom.aside` идёт под чат, не над ним (порядок: hero → chat → sidebar).
- Sidebar-панели остаются полноценными на mobile — не свернутыми (в v1 отказ от collapsible-логики, чтобы не терять действия).
- В `DialogActionsService.transition` — `Logger.log` с actorId, dialogId, action, before → after для аудита.
- `SystemSetting.message` дефолт для `tutor_exchange` — уже из этапа 1: «Биржа лидов скоро откроется…». Проверить, что не переписывается.
- Smoke-чек-лист — `docs/superpowers/checklists/tutor-exchange-smoke.md`, идёт по всем 6 этапам от роли админа + двух репетиторов.

---

### Task 1: Mobile-раскладка DialogRoom

**Files:**
- Modify: `frontend/src/components/tutor-exchange/DialogRoom.tsx`

**Steps:**

- [ ] На `<md` — grid 1 column: сначала hero + чат, потом sidebar (сейчас aside всегда справа).
- [ ] Тестировать в браузере на 375px.
- [ ] Commit.

### Task 2: Логирование action-ов

**Files:**
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialog-actions.service.ts`

**Steps:**

- [ ] `Logger` внутри сервиса, в `transition` — `log()` до/после результата с полем `actor, dialog, action, prev→next`.
- [ ] Commit.

### Task 3: Smoke-чек-лист

**Files:**
- Create: `docs/superpowers/checklists/tutor-exchange-smoke.md`

**Steps:**

- [ ] Пошаговый е2е чек-лист (админ → бета-репетитор A → бета-репетитор B).
- [ ] Проверки на все 6 этапов (флаг, заявка, отклик, state-machine, рейтинг, уведомления).
- [ ] Rollout-инструкция: включить флаг из `/check/prrv/admin/tools` и пронаблюдать неделю.
- [ ] Commit.

### Готовность этапа 6

- Frontend `/dashboard/dialogs/[id]` на mobile 375px не «ломает» sidebar.
- В логах прода видны переходы диалогов.
- Есть smoke-чек-лист для беты.
- Master зелёный + запушен.
