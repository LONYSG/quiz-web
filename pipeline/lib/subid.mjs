// =============================================================================
// 소분류 식별자 (R017)
//
// ★★ 왜 이름을 그대로 쓰지 않고 별도 ID 를 만드는가
//   소분류 이름에는 공백과 가운뎃점(·)과 괄호가 들어간다 —
//     "한글 자모·맞춤법" / "고전(고대~18세기)" / "1980~90년대"
//   ★ 이것을 파일명으로 쓰면 Windows·git·쉘 셋 다에서 사고가 난다.
//     (git 의 core.quotepath, 쉘의 글로빙, 파일 시스템 정규화)
//   → ★ 파일명은 **ASCII 인 midKey + 번호**만 쓴다. 이름은 파일 안에 넣는다.
//
// subId    "kr-language/1"     (중분류 키 / 그 중분류 안에서의 1-based 순번)
// slug     "kr-language-1"     (파일명·디렉터리용)
//
// ★★ 위험: categories.ts 에서 subs 배열의 순서가 바뀌면 번호가 밀린다.
//   → 그래서 저장할 때 **소분류 이름을 항상 함께 적고**, 읽을 때 대조한다.
//     어긋나면 조용히 넘어가지 않고 예외를 던진다. (resolveSubId / assertSubName)
// =============================================================================

import { MIDS, findMid, findMajor } from '../dist/categories.js';

/** (midKey, subName) → subId. 없으면 예외 */
export function subIdOf(midKey, subName) {
  const mid = findMid(midKey);
  if (!mid) throw new Error(`중분류를 찾을 수 없다: ${midKey}`);
  const idx = mid.subs.indexOf(subName);
  if (idx < 0) throw new Error(`소분류를 찾을 수 없다: ${midKey} > ${subName}`);
  return `${midKey}/${idx + 1}`;
}

/** subId → { midKey, subName, mid, major, path } */
export function resolveSubId(subId) {
  const m = /^(.+)\/(\d+)$/.exec(subId);
  if (!m) throw new Error(`subId 형식이 아니다: ${subId}`);
  const [, midKey, num] = m;
  const mid = findMid(midKey);
  if (!mid) throw new Error(`중분류를 찾을 수 없다: ${midKey}`);
  const subName = mid.subs[Number(num) - 1];
  if (!subName) throw new Error(`소분류 번호가 범위를 벗어난다: ${subId}`);
  const major = findMajor(mid.major);
  return {
    subId,
    midKey,
    midName: mid.nameKo,
    majorKey: mid.major,
    majorName: major?.nameKo ?? mid.major,
    subName,
    path: `${major?.nameKo ?? mid.major} > ${mid.nameKo} > ${subName}`,
    boundary: mid.boundary ?? null,
    subNote: mid.subNotes?.[subName] ?? null,
  };
}

/**
 * ★ 저장된 이름과 지금 트리의 이름이 같은지 확인한다.
 *   categories.ts 의 subs 순서가 바뀌면 번호가 밀리므로 반드시 필요하다.
 */
export function assertSubName(subId, storedName) {
  const r = resolveSubId(subId);
  if (r.subName !== storedName) {
    throw new Error(
      `소분류 이름이 어긋난다. subId=${subId} 저장된 이름="${storedName}" 현재 트리="${r.subName}"\n` +
        `★ categories.ts 의 subs 순서가 바뀐 것으로 보인다. 손으로 확인하라.`,
    );
  }
  return r;
}

/** 파일명용 slug */
export function slugOf(subId) {
  return subId.replace('/', '-');
}

/** 전체 소분류 목록 (subId 포함) */
export function allSubs() {
  const out = [];
  for (const mid of MIDS) {
    mid.subs.forEach((subName, i) => {
      out.push(resolveSubId(`${mid.key}/${i + 1}`));
    });
  }
  return out;
}
