# `supabase/`

Numbered SQL files, run once each, in order, against the live project. Nothing
in this repo can reach the project with DDL rights and that is deliberate
(ADR-0001): `.env` holds the publishable key only. What can is the Supabase
CLI signed in as the project owner on the human's machine:

```sh
supabase login                       # once, opens a browser
supabase db query --linked --project-ref mvvxyzqbdkkauxkltavw -f supabase/NN-name.sql
```

It runs the file through the Management API as `postgres`, the same role the
SQL Editor uses, and no database password is involved. Pasting into the SQL
Editor is the same thing done by hand. `08` through `13` went in this way on
2026-09-16.

Two rules the files keep to:

- **A shipped file is never edited.** Changing a shipped column means a new
  numbered file, so a reader comparing the two gets a readable diff.
- **Reasoning lives beside the statement**, not in a ticket. ADR-0003 condition
  4 requires it for exposed `security definer` functions, and the habit is
  older than the rule.

## Rehearsing a migration locally

The live project is the only Supabase project this repo has, and running a
migration against it is a one-way door. Rehearse first, on a throwaway local
stack that starts empty and is thrown away afterwards. Every later migration
stacks on the same sequence, so this procedure does not change as files are
added.

Needs Docker running. **Do all of it outside the repo** — `supabase init`
writes a `config.toml` into whatever `supabase/` folder it finds, and this one
is not a CLI project.

```sh
# the directory name becomes the container names below, so keep it `rehearsal`
mkdir -p /tmp/friens-cal/rehearsal && cd /tmp/friens-cal/rehearsal
npx -y supabase@latest init
npx -y supabase@latest start
npx -y supabase@latest status -o env      # DB_URL, API_URL, PUBLISHABLE_KEY
```

If `start` fails with `port is already allocated`, another local stack is
running. Do not stop it — it may not be yours. Edit the ports in
`supabase/config.toml` (`54321`–`54327` move together) and start again.

Apply the files in order, as `postgres`, which is the role the SQL Editor uses
and which the `private` helper's owner has to be:

```sh
cd /path/to/friens-cal
for f in supabase/0[0-3]*.sql supabase/0[5-9]*.sql supabase/1*.sql; do
  echo "== $f"
  docker exec -i supabase_db_rehearsal psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 < "$f" || break
done
```

`04-demo-second-friend.sql` is demo data rather than schema; skip it unless the
thing being rehearsed needs it.

Accounts, so the policies have somebody to be evaluated as. The allowlist hook
is a dashboard registration and is not wired up locally, so signup is open:

```sh
SR=$(npx -y supabase@latest status -o env | grep ^SERVICE_ROLE_KEY | cut -d'"' -f2)
curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
  -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"rehearsal-pass-1","email_confirm":true}'
```

`01-friend.sql`'s trigger gives each of them a blank `friend` row.

To exercise a policy from psql, become the role the browser is and hand it the
claim `auth.uid()` reads:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<the auth.users id>","role":"authenticated"}';
-- … the statements a client would issue …
commit;
```

Read what the broadcast triggers wrote — the same rows Realtime delivers:

```sql
select topic, event, payload->>'table', count(*) from realtime.messages group by 1,2,3;
```

And to check a channel-join policy, set the topic the way `realtime.send` does:

```sql
set local realtime.topic to 'cal:<cal id>:availability';
select count(*) from realtime.messages;
```

The verify scripts work against the local stack too, with a throwaway env file
holding the local `API_URL` and `PUBLISHABLE_KEY` and one of the accounts above:

```sh
node --env-file=.env.rehearsal scripts/verify-realtime.mjs
```

**Run `verify-realtime.mjs` twice on a fresh stack**, and believe the second
run. The local Realtime container creates its `realtime.messages` replication
slot lazily, on the first private channel join, so a broadcast written in the
same instant as that first join is never delivered — the first run reports "NO
INSERT MESSAGE" and the trigger is fine. A real project's slot has existed since
the project did.

A script that writes from the repo has to run from the repo: `node --env-file`
resolves `@supabase/supabase-js` against the working directory, so a throwaway
probe placed in a scratch folder cannot import it.

Finish with `npx -y supabase@latest stop`, which leaves nothing behind.

## Files

| File | What it does |
| --- | --- |
| `00-provisioning.sql` | `btree_gist`, and the smoke test that proved the two locks. Historical. |
| `01-friend.sql` | `friend`, and the trigger that makes one per account. |
| `02-availability.sql` | `availability` as slot rows. |
| `03-realtime.sql` | Publishes `availability` and `friend`. Superseded in part by `11`. |
| `04-demo-second-friend.sql` | Demo data. Not schema. |
| `05-hangout.sql` | `hangout` and `hangout_participant`. Superseded in part by `11`. |
| `06-hangout-lifecycle.sql` | Provenance, the drop trigger, the auto-cancel, `retime_hangout`. |
| `07-allowlist.sql` | The allowlist and the signup hook that reads it. |
| `08-cal-and-membership.sql` | `private.my_cal_ids()`, `cal`, `membership`, `create_cal`, `join_cal`. |
| `09-per-cal.sql` | **The outage.** `cal_id` through three tables, every policy rewritten. |
| `10-lifecycle-per-cal.sql` | The lifecycle functions made cal-aware, and the Left that leaving writes. |
| `11-realtime-per-cal.sql` | Broadcast triggers, the `realtime.messages` policy, the publication drops. |
| `12-cal-members-topic.sql` | One more broadcast trigger, so the roster hears a join or a leave. |
| `13-invite.sql` | `allowlist.invited_by`, a tighter email constraint, and the one `insert` grant that lets a Friend invite. |

`08` through `11` are one cutover and are run in one sitting: `09` breaks the
deployed client and `11` silences it, so the client deploy follows immediately.
`13-invite.sql` is not part of that sitting. It touches only `allowlist`, which
the cutover does not, so it can be run before or after.
