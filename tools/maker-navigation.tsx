/** Shared navigation among the implemented maker pages.
 * A link only appears when the corresponding page actually exists.
 */
export function MakerNavigation({active}:{active:'map'|'monster'|'town'}){
  return <nav className="maker-navigation" aria-label="제작 도구">
    <a href="/map-maker.html" aria-current={active==='map'?'page':undefined}>맵 메이커</a>
    <a href="/monster-maker.html" aria-current={active==='monster'?'page':undefined}>몬스터 메이커</a>
    <a href="/town-maker.html" aria-current={active==='town'?'page':undefined}>마을 메이커</a>
    <span className="maker-navigation-status" aria-label="추가 도구는 추후 구현">NPC · 퀘스트: 준비 중</span>
  </nav>;
}