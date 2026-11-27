// =============================================================================
// ★★★ R123 봇 시나리오 — bot.mjs 가 부른다(SCENARIOS.r123 · trim). 서버 = 기본 TRIM(콘텐츠 줄이기 켬).
//
//   trim  — 미니게임만 → 퀴즈 · 주제 고르기 무시(null) · 노래 연대 · 장르 무시 · 시작 막힘 제목 = 사람 말(오류 코드 아님) ·
//           팀전은 혼자도 켜짐 · 홀수면 시작 막힘 · 모드 바꾸기 채팅에 인원 꼬리 없음
//   r123  — trim 전부 + 캐치마인드 다른 제시어(무료 1 → 5P · 잔액 모자람 · 차감 · 최대 3번) ·
//           혼자 하기: 틀린 답 즉시(solo.wrong) · 아이템 사기(차감) · 힌트 · 초성 · 넘기기(목숨 안 깎음) · 한 문제 두 번 거름 ·
//           해설 시간(4~12초) → solo.next → 카운트 3초 → 다음 · 안 쓴 아이템 돌려받기 · 잔액 모자람 · 정답 6글자 넘는 문제 안 나옴
// =============================================================================

export function makeR123({ makeBots, Bot, withDb, sleep, expect, expectTrue, checkSummary, answersForText, log }) {
  const idOf = async (bot) => withDb(async (c) => (await c.query(`SELECT id::text AS id FROM accounts WHERE login_id = $1`, [bot.loginId])).rows[0]?.id ?? null);
  const setPoints = async (accountId, want) =>
    withDb(async (c) => {
      // 잔액을 want 로 맞춘다(지급 한 줄 · 검사 계정만)
      const r = await c.query(
        `SELECT (SELECT count(*) FROM answer_events WHERE account_id = $1 AND accepted)::int +
                (SELECT coalesce(sum(amount), 0) FROM minigame_rewards WHERE account_id = $1)::int +
                (SELECT coalesce(sum(amount), 0) FROM point_grants WHERE account_id = $1)::int -
                (SELECT coalesce(sum(amount), 0) FROM point_spends WHERE account_id = $1)::int AS bal`,
        [accountId],
      );
      const diff = want - Number(r.rows[0].bal);
      if (diff > 0) await c.query(`INSERT INTO point_grants (account_id, amount, reason, note) VALUES ($1, $2, 'admin', 'bot r123')`, [accountId, diff]);
      if (diff < 0) await c.query(`INSERT INTO point_spends (account_id, amount, reason, ref) VALUES ($1, $2, 'bot-adjust', 'bot r123')`, [accountId, -diff]);
    });
  const balance = async (accountId) =>
    withDb(async (c) =>
      Number(
        (
          await c.query(
            `SELECT (SELECT count(*) FROM answer_events WHERE account_id = $1 AND accepted)::int +
                    (SELECT coalesce(sum(amount), 0) FROM minigame_rewards WHERE account_id = $1)::int +
                    (SELECT coalesce(sum(amount), 0) FROM point_grants WHERE account_id = $1)::int -
                    (SELECT coalesce(sum(amount), 0) FROM point_spends WHERE account_id = $1)::int AS bal`,
            [accountId],
          )
        ).rows[0].bal,
      ),
    );

  async function trimPart() {
    const [host, b2] = await makeBots(2);
    for (const b of [host, b2]) await b.connect();
    host.createRoom('R123 줄이기');
    await host.waitFor(() => host.snapshot !== null, 6000, '방');
    const roomId = host.snapshot.room.id;
    const settled = async (payload, label) => {
      const m = host.mark();
      host.socket.emit('lobby.updateSettings', payload);
      await host.waitFor(() => host.since(m, 'lobby.settingsUpdated').length > 0 || host.since(m, 'error').length > 0, 4000, label);
      return { s: host.since(m, 'lobby.settingsUpdated').at(-1)?.settings ?? null, e: host.since(m, 'error')[0] ?? null };
    };
    let r = await settled({ questionCount: 5, mode: 'minigame', minigameOnly: true, minigameRounds: 3 }, '미니게임만');
    expectTrue('★★ R123 trim — 미니게임만을 보내면 퀴즈로 읽는다', r.s?.mode === 'quiz' && r.s?.minigameOnly === false, JSON.stringify(r));
    r = await settled({ questionCount: 5, mode: 'liar', minigameRounds: 5, liarTopics: ['liar-food'] }, '라이어 주제');
    expectTrue('★★ R123 trim — 라이어 주제 고르기를 보내도 전체(null)', r.s?.mode === 'liar' && r.s?.liarTopics === null, JSON.stringify(r.s?.liarTopics));
    // 시작 막힘 — 제목이 사람 말(옛: "요청 형식이 올바르지 않습니다" + detail)
    let m = host.mark();
    host.socket.emit('game.start', {});
    await sleep(500);
    let e = host.since(m, 'error')[0];
    expectTrue('★★ R123 A3 — 라이어 1명 시작 → 제목 "라이어 게임은 3명부터 할 수 있어요"(기본 제목 아님)', e && e.message === '라이어 게임은 3명부터 할 수 있어요', JSON.stringify(e));
    r = await settled({ questionCount: 5, mode: 'draw', minigameRounds: 50, drawTopics: [] }, '캐치 50');
    expectTrue('★★ R123 A8 — 캐치마인드 문제 수 50 받음 · 주제 null', r.s?.mode === 'draw' && r.s?.minigameRounds === 50 && r.s?.drawTopics === null, JSON.stringify(r));
    r = await settled({ questionCount: 5, mode: 'draw', minigameRounds: 51 }, '캐치 51');
    expectTrue('★ R123 A8 — 51 → 거절 "캐치마인드 문제 수는 2~50"', /캐치마인드 문제 수는 2~50/.test(r.e?.message ?? ''), JSON.stringify(r.e));
    r = await settled({ questionCount: 5, mode: 'song', songCount: 5, songCategories: ['kr'], songDecades: [], songLegend: false, songGenres: [] }, '노래');
    expectTrue('★★ R123 trim — 노래 연대 · 장르 · 명곡을 비워 보내도 전체', r.s?.mode === 'song' && r.s?.songDecades?.length === 3 && r.s?.songLegend === true && r.s?.songGenres?.length === 9, JSON.stringify(r));
    // 팀전 — 혼자도 켜짐 · 2명 짝수면 시작 · 3명이면 막힘은 team 시나리오
    r = await settled({ questionCount: 5, mode: 'quiz', teamMode: true }, '팀전');
    expectTrue('★★ R123 A7 — 혼자 팀전 켜기 OK', r.s?.teamMode === true && !r.e, JSON.stringify(r));
    m = host.mark();
    host.socket.emit('game.start', {});
    await sleep(500);
    e = host.since(m, 'error')[0];
    expectTrue('★★ R123 A7 — 혼자(홀수) 팀전 시작 → "팀전은 짝수 인원일 때 시작할 수 있어요"', e?.message === '팀전은 짝수 인원일 때 시작할 수 있어요', JSON.stringify(e));
    await settled({ questionCount: 5, mode: 'quiz', teamMode: false }, '팀전 끔');
    b2.join(roomId);
    await b2.waitFor(() => b2.snapshot?.room.id === roomId, 6000, '입장');
    for (const b of [host, b2]) {
      b.leave();
      await sleep(40);
      b.disconnect();
    }
  }

  async function drawPart() {
    const [host, b2] = await makeBots(2);
    for (const b of [host, b2]) await b.connect();
    const hostId = await idOf(host);
    await withDb(async (c) => c.query(`DELETE FROM point_spends WHERE account_id = $1 AND reason = 'draw-reroll'`, [hostId]));
    await setPoints(hostId, 7);
    host.createRoom('R123 제시어');
    await host.waitFor(() => host.snapshot !== null, 6000, '방');
    const roomId = host.snapshot.room.id;
    b2.join(roomId);
    await b2.waitFor(() => b2.snapshot?.room.id === roomId, 6000, '입장');
    const views = [];
    host.socket.on('draw.state', (p) => p.draw && views.push(p.draw));
    const last = () => views[views.length - 1];
    let m = host.mark();
    host.socket.emit('lobby.updateSettings', { questionCount: 5, mode: 'draw', minigameRounds: 10 });
    await host.waitFor(() => host.since(m, 'lobby.settingsUpdated').some((x) => x.settings?.mode === 'draw'), 4000, '캐치');
    const g = host.mark();
    host.socket.emit('game.start', {});
    await host.waitFor(() => host.since(g, 'game.started').length > 0, 12000, '시작');
    // 출제자가 host 가 아닐 수 있다 — host 가 출제자인 차례까지
    const drawerBot = async () => {
      await host.waitFor(() => last()?.phase === 'draw', 10000, '그리기');
      return last().amDrawer ? host : null;
    };
    let d = await drawerBot();
    if (!d) {
      b2.socket.emit('draw.giveUp', {});
      await host.waitFor(() => last()?.round === 2 && last()?.phase === 'draw', 15000, 'R2');
      d = last().amDrawer ? host : null;
    }
    if (!d) {
      expectTrue('★ R123 A9 — host 가 출제자인 차례를 못 만났다', false, JSON.stringify(last()));
      return;
    }
    expect('★ R123 A9 — 처음 다른 제시어는 무료(rerollCost 0)', last().rerollCost, 0);
    let kw = last().keyword;
    host.socket.emit('draw.reroll', {});
    await host.waitFor(() => last().keyword !== kw, 3000, '무료 바꿈');
    expect('★★ R123 A9 — 무료 뒤 5P', [last().canReroll, last().rerollCost], [true, 5]);
    kw = last().keyword;
    m = host.mark();
    host.socket.emit('draw.reroll', {});
    await host.waitFor(() => last().keyword !== kw, 3000, '유료 1');
    expect('★★ R123 A9 — 5P 내고 바뀜 · 잔액 7 → 2', await balance(hostId), 2);
    const sp = await withDb(async (c) => (await c.query(`SELECT amount, ref FROM point_spends WHERE account_id = $1 AND reason = 'draw-reroll'`, [hostId])).rows);
    expectTrue('★ R123 A9 — point_spends draw-reroll 5P 한 줄', sp.length === 1 && sp[0].amount === 5, JSON.stringify(sp));
    kw = last().keyword;
    m = host.mark();
    host.socket.emit('draw.reroll', {});
    await sleep(600);
    const e = host.since(m, 'error')[0];
    expectTrue('★★ R123 A9 — 잔액 모자람 → "포인트가 모자라요" · 제시어 그대로', /포인트가 모자라요/.test(e?.message ?? '') && last().keyword === kw, JSON.stringify(e));
    await setPoints(hostId, 100);
    for (let i = 0; i < 2; i += 1) {
      kw = last().keyword;
      host.socket.emit('draw.reroll', {});
      await host.waitFor(() => last().keyword !== kw, 3000, `유료 ${i + 2}`);
    }
    expectTrue('★★ R123 A9 — 유료 3번 뒤에는 못 바꿈(canReroll false)', last().canReroll === false, JSON.stringify({ c: last().canReroll, cost: last().rerollCost }));
    host.socket.emit('host.forceEnd', {});
    await sleep(500);
    for (const b of [host, b2]) {
      b.leave();
      await sleep(40);
      b.disconnect();
    }
  }

  async function soloPart() {
    const [a] = await makeBots(1);
    await a.connect();
    const aId = await idOf(a);
    await withDb(async (c) => {
      await c.query(`DELETE FROM solo_runs WHERE account_id = $1`, [aId]);
      await c.query(`DELETE FROM point_spends WHERE account_id = $1 AND reason = 'solo-item'`, [aId]);
    });
    // 잔액 모자람 — 30P 로 넘기기 1 + 힌트 1(35P) → 시작 안 됨
    await setPoints(aId, 30);
    let from = a.mark();
    a.socket.emit('solo.start', { items: { hint: 1, initial: 0, skip: 1 } });
    await a.waitFor(() => a.since(from, 'error').length > 0 || a.since(from, 'solo.started').length > 0, 6000, '모자람');
    const e0 = a.since(from, 'error')[0];
    expectTrue('★★ R123 B6 — 잔액 30P 에 35P → 시작 안 됨 · "포인트가 모자라요 (지금 30P)" · 코드 아닌 사람 말 제목', e0 && /포인트가 모자라요 \(지금 30P\)/.test(e0.message) && a.since(from, 'solo.started').length === 0, JSON.stringify(e0));
    // 100P — 힌트 1 · 초성 1 · 넘기기 1(45P)
    await setPoints(aId, 100);
    from = a.mark();
    a.socket.emit('solo.start', { items: { hint: 1, initial: 1, skip: 1, bogus: 9 } });
    await a.waitFor(() => a.since(from, 'solo.question').length > 0, 8000, '첫 문제');
    expect('★★ R123 B6 — 시작할 때 45P 차감(한 줄)', await balance(aId), 55);
    const q1 = a.since(from, 'solo.question')[0];
    expectTrue('★ R123 B6 — 문제에 남은 아이템 1 · 1 · 1', q1.items?.hint === 1 && q1.items.initial === 1 && q1.items.skip === 1, JSON.stringify(q1.items));
    // 틀린 답 → solo.wrong 즉시 · 다시 칠 수 있다
    a.socket.emit('solo.answer', { n: q1.n, text: '봇이틀린답zz' });
    await a.waitFor(() => a.since(from, 'solo.wrong').some((x) => x.n === q1.n), 2000, '오답 즉시');
    expect('★★ R123 B5 — 틀린 답 → solo.wrong 즉시 · 결과 없음', a.since(from, 'solo.result').length, 0);
    // 초성 → 글 · 두 번째 초성 거름
    a.socket.emit('solo.item', { n: q1.n, kind: 'initial' });
    await a.waitFor(() => a.since(from, 'solo.item').some((x) => x.kind === 'initial'), 2000, '초성');
    const it = a.since(from, 'solo.item').find((x) => x.kind === 'initial');
    expectTrue('★★ R123 B6 — 초성 아이템 → 초성 글 · 남은 초성 0', typeof it.text === 'string' && it.text.length > 0 && it.items.initial === 0, JSON.stringify(it));
    a.socket.emit('solo.item', { n: q1.n, kind: 'initial' });
    await a.waitFor(() => a.since(from, 'solo.itemRejected').length > 0, 2000, '초성 두 번');
    expect('★ R123 B6 — 남은 게 없으면 거름(solo.itemRejected)', a.since(from, 'solo.itemRejected').length, 1);
    // 맞힘 → 해설 시간(4~12초) · countAt − 결과 ≈ 해설 · solo.next → 바로 카운트(3초) → 다음 문제
    const ans = (await answersForText(q1.text))[0];
    a.socket.emit('solo.answer', { n: q1.n, text: ans });
    await a.waitFor(() => a.since(from, 'solo.result').length > 0, 3000, '맞힘');
    const r1 = a.since(from, 'solo.result')[0];
    const explain = r1.countAt - r1.explainUntil + (r1.explainUntil - (r1.nextAt - 3000 - (r1.countAt - r1.explainUntil)));
    expectTrue('★★ R123 B5 — 맞힘 → 정답 · 해설 · countAt = 해설 끝 · nextAt = countAt + 3초 · 해설 4~12초', r1.ok && r1.countAt === r1.explainUntil && r1.nextAt - r1.countAt === 3000 && r1.countAt - Date.now() > 2000, JSON.stringify({ r1, explain }));
    const t0 = Date.now();
    a.socket.emit('solo.next', { n: r1.n });
    await a.waitFor(() => a.since(from, 'solo.count').length > 0, 2000, '카운트');
    const c1 = a.since(from, 'solo.count')[0];
    expectTrue('★★ R123 B5 — 해설 중 Enter(solo.next) → 바로 카운트 · 3초 뒤 다음', Math.abs(c1.countAt - t0) < 800 && c1.nextAt - c1.countAt === 3000, JSON.stringify(c1));
    await a.waitFor(() => a.since(from, 'solo.question').length > 1, 5000, '다음 문제');
    const t1 = Date.now() - t0;
    expectTrue('★ R123 B5 — 다음 문제가 약 3초 뒤', t1 >= 2600 && t1 <= 4500, String(t1));
    // 넘기기 → 목숨 그대로 · 맞힌 수 그대로 · end skip
    const q2 = a.since(from, 'solo.question')[1];
    a.socket.emit('solo.item', { n: q2.n, kind: 'skip' });
    await a.waitFor(() => a.since(from, 'solo.result').length > 1, 3000, '넘기기');
    const r2 = a.since(from, 'solo.result')[1];
    expectTrue('★★ R123 B6 — 넘기기 → end skip · 목숨 3 · 맞힌 1 · 정답 보여 줌', r2.end === 'skip' && r2.lives === 3 && r2.correct === 1 && r2.answer, JSON.stringify(r2));
    // 나머지는 시간 끝으로 — 해설 중 solo.next 로 빨리
    for (;;) {
      await a.waitFor(() => a.since(from, 'solo.end').length > 0 || a.since(from, 'solo.result').length > a.since(from, 'solo.question').length - 0 || false, 1, '').catch(() => {});
      const ended = a.since(from, 'solo.end').length > 0;
      if (ended) break;
      const qs = a.since(from, 'solo.question');
      const rs = a.since(from, 'solo.result');
      if (rs.length >= qs.length) {
        const lr = rs[rs.length - 1];
        if (lr.nextAt !== null) a.socket.emit('solo.next', { n: lr.n });
        await a.waitFor(() => a.since(from, 'solo.question').length > qs.length || a.since(from, 'solo.end').length > 0, 8000, '다음');
      } else await a.waitFor(() => a.since(from, 'solo.result').length > rs.length || a.since(from, 'solo.end').length > 0, 8000, '시간 끝');
    }
    const end = a.since(from, 'solo.end')[0];
    expectTrue('★★ R123 B6 — 끝: 산 것 1 · 1 · 1 · 쓴 것 초성 1 · 넘기기 1 · 돌려받음 5P', end.items?.bought?.hint === 1 && end.items.used.initial === 1 && end.items.used.skip === 1 && end.items.used.hint === 0 && end.items.refunded === 5, JSON.stringify(end.items));
    await sleep(500);
    // 잔액은 첫 판 띠(+10P)가 더해지니 쓴 값만 본다: 45P 를 냈고 안 쓴 힌트 5P 를 돌려받아 40P
    const spent = await withDb(async (c) => (await c.query(`SELECT coalesce(sum(amount), 0)::int AS s FROM point_spends WHERE account_id = $1 AND reason = 'solo-item'`, [aId])).rows[0].s);
    expect('★★ R123 B6 — 안 쓴 힌트 5P 돌려받음 → 쓴 값 40P', spent, 40);
    const db = await withDb(async (c) => ({
      run: (await c.query(`SELECT items FROM solo_runs WHERE account_id = $1 ORDER BY id DESC LIMIT 1`, [aId])).rows[0]?.items ?? null,
      ans: (await c.query(`SELECT n, "end", items FROM solo_answers WHERE run_id = (SELECT id FROM solo_runs WHERE account_id = $1 ORDER BY id DESC LIMIT 1) ORDER BY n`, [aId])).rows,
      spend: (await c.query(`SELECT amount, ref FROM point_spends WHERE account_id = $1 AND reason = 'solo-item'`, [aId])).rows,
    }));
    expectTrue('★★ R123 B6 — 기록: solo_runs.items · 문제마다 쓴 아이템(1번 initial · 2번 skip) · 값 한 줄 40P(ref solo_run)', db.run && db.run.refunded === 5 && db.ans[0]?.items?.includes('initial') && db.ans[1]?.end === 'skip' && db.ans[1]?.items?.includes('skip') && db.spend.length === 1 && db.spend[0].amount === 40 && /^solo_run:/.test(db.spend[0].ref ?? ''), JSON.stringify(db));
    // 정답 6글자 넘는 문제는 안 나온다(이 판의 문제 전부)
    const ids = db.ans.map((x) => x.n);
    const long = await withDb(async (c) =>
      (
        await c.query(
          `SELECT count(*)::int AS n FROM solo_answers sa JOIN questions q ON q.id = sa.question_id
            WHERE sa.run_id = (SELECT id FROM solo_runs WHERE account_id = $1 ORDER BY id DESC LIMIT 1) AND char_length(regexp_replace(q.display_answer, '\\s', '', 'g')) > 6`,
          [aId],
        )
      ).rows[0].n,
    );
    expect(`★★ R123 B4 — 정답이 띄어쓰기 빼고 6글자 넘는 문제는 안 나온다(이 판 ${ids.length}문제)`, long, 0);
    a.disconnect();
  }

  // ★★ R124 — 시작 카운트다운(누른 때 + 3초에 첫 문제 · 첫 문제 시간 안 깎임) · 카운트다운 중 다시 붙기 · 틀린 답 미리 보기(probe) ·
  //   첫 다섯 문제(맞힌 수 5 전) 등급 1 · 이모지 문제 안 나옴 · 판정은 그대로 서버(미리 보기가 틀렸다 해도 서버 solo.wrong 은 온다)
  async function soloR124Part() {
    const sh = await import(new URL('../shared/dist/index.js', import.meta.url).href);
    const [a] = await makeBots(1);
    await a.connect();
    const aId = await idOf(a);
    await withDb((c) => c.query(`DELETE FROM solo_runs WHERE account_id = $1`, [aId]));
    let from = a.mark();
    const sentAt = Date.now();
    a.socket.emit('solo.start', {});
    await a.waitFor(() => a.since(from, 'solo.started').length > 0, 6000, '시작');
    const st = a.since(from, 'solo.started')[0];
    const startedLag = Date.now() - sentAt;
    expectTrue('★★ R124 2 — solo.started 는 곧바로(준비 끝) · firstAt = 누른 때 + 3초(±300ms)', typeof st.firstAt === 'number' && Math.abs(st.firstAt - sentAt - 3000) < 300 && startedLag < 1500, JSON.stringify({ firstAtMinusSent: st.firstAt - sentAt, startedLag }));
    // 카운트다운 중 다시 붙기(solo.sync) → state 에 같은 firstAt · 문제 없음
    a.socket.emit('solo.sync', {});
    await a.waitFor(() => a.since(from, 'solo.state').length > 0, 2000, '카운트다운 중 sync');
    const ss = a.since(from, 'solo.state')[0];
    expectTrue('★★ R124 2 — 카운트다운 중 다시 붙으면 firstAt 그대로 · 문제 없음', ss.firstAt === st.firstAt && ss.question === null, JSON.stringify(ss));
    expect('★★ R124 2 — 카운트다운 동안 문제가 나가지 않는다', a.since(from, 'solo.question').length, 0);
    await a.waitFor(() => a.since(from, 'solo.question').length > 0, 6000, '첫 문제');
    const q1 = a.since(from, 'solo.question')[0];
    const q1At = Date.now();
    expectTrue('★★ R124 2 — 첫 문제는 firstAt 뒤에 · 시간은 문제가 나간 때부터(endsAt − 지금 ≈ limitMs · 카운트다운에 안 깎임)', q1At >= st.firstAt - 50 && q1.endsAt - q1At > q1.limitMs - 400 && q1.endsAt - st.firstAt >= q1.limitMs - 100, JSON.stringify({ late: q1At - st.firstAt, left: q1.endsAt - q1At, limit: q1.limitMs }));
    // 미리 보기 — 통이 있고 · 정답 · 정답이다 = 맞을 수 있음 · 엉뚱한 답 = 분명히 틀림
    const ans = (await answersForText(q1.text))[0];
    const maybe = (t) => sh.answerProbeKeys(t).some((k) => q1.probe.buckets.includes(sh.probeBucket(q1.probe.salt, k)));
    expectTrue('★★ R124 1 — 문제에 probe(소금 · 통 번호 0~1023) · 정답 · "정답이다" = 통에 듦 · 엉뚱한 답 = 안 듦', q1.probe && Number.isInteger(q1.probe.salt) && q1.probe.buckets.length > 0 && q1.probe.buckets.every((b) => b >= 0 && b < 1024) && maybe(ans) && maybe(`${ans}이다`) && !maybe('봇의아주엉뚱한답qqq'), JSON.stringify({ probe: q1.probe, ans }));
    expectTrue('★★ R124 1 — 문제 글에 정답 글자가 그대로 실리지 않는다(통 번호만)', !JSON.stringify(q1).includes(`"${ans}"`), ans);
    // 판정은 그대로 서버: 엉뚱한 답에도 solo.wrong 이 온다
    a.socket.emit('solo.answer', { n: q1.n, text: '봇의아주엉뚱한답qqq' });
    await a.waitFor(() => a.since(from, 'solo.wrong').length > 0, 2000, '서버 오답');
    // 첫 다섯 문제 = 등급 1(맞힌 수 5 전 · SOLO_RAMP) · 이모지 문제 없음 — 여섯 문제 맞힌다(해설은 solo.next 로)
    const grades = [];
    const emoji = [];
    let q = q1;
    for (let k = 0; k < 6; k++) {
      grades.push({ n: q.n, correctBefore: q.correct, grade: q.grade });
      if (sh.isEmojiQuestion(q.text)) emoji.push(q.text);
      const t = (await answersForText(q.text))[0];
      const m = a.mark();
      a.socket.emit('solo.answer', { n: q.n, text: t });
      await a.waitFor(() => a.since(m, 'solo.result').length > 0, 3000, `맞힘 ${q.n}`);
      a.socket.emit('solo.next', { n: q.n });
      await a.waitFor(() => a.since(m, 'solo.question').length > 0, 6000, `다음 ${q.n}`);
      q = a.since(m, 'solo.question')[0];
    }
    expectTrue('★★ R124 3-3 — 맞힌 수 5 전의 문제(첫 다섯)는 전부 등급 1', grades.filter((g) => g.correctBefore < 5).length === 5 && grades.filter((g) => g.correctBefore < 5).every((g) => g.grade === 1), JSON.stringify(grades));
    expect('★★ R124 3 — 이 판에 이모지 문제 0', emoji.length, 0);
    a.socket.emit('solo.quit', {});
    await a.waitFor(() => a.since(from, 'solo.end').length > 0, 5000, '그만');
    // 풀 전체: 혼자 하기 풀(서버와 같은 함수)에 이모지 문제 0 · 활성 문항에는 있다
    const counts = await withDb(async (c) => (await c.query(`SELECT question_text AS t FROM questions WHERE is_active`)).rows.map((r) => r.t));
    const emo = counts.filter((t) => sh.isEmojiQuestion(t)).length;
    log(`  [R124] 검사 DB 활성 ${counts.length} 중 이모지 문제 ${emo}`);
    a.disconnect();
  }

  return {
    async r124() {
      log('시나리오 r124 — ★★ R124 혼자 하기 카운트다운 · 틀린 답 미리 보기 · 첫 다섯 등급 · 이모지 빼기');
      await soloR124Part();
      return checkSummary();
    },
    async trim() {
      log('시나리오 trim — ★★ R123 콘텐츠 줄이기(기본 TRIM)');
      await trimPart();
      return checkSummary();
    },
    async r123() {
      log('시나리오 r123 — ★★★ R123 줄이기 · 유료 다른 제시어 · 혼자 하기 아이템 · 해설 Enter');
      await trimPart();
      await drawPart();
      await soloPart();
      await soloR124Part();
      return checkSummary();
    },
  };
}
