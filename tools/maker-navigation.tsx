/** Shared navigation for the two implemented maker tools.
 * The future town/NPC/quest makers are intentionally not linked as if they existed.
 */
export function MakerNavigation({active}:{active:'map'|'monster'}){
  return <nav className="maker-navigation" aria-label="제작 도구">
    <a href="/map-maker.html" aria-current={active==='map'?'page':undefined}>맵 메이커</a>
    <a href="/monster-maker.html" aria-current={active==='monster'?'page':undefined}>몬스터 메이커</a>
    <span className="maker-navigation-status" aria-label="추가 도구는 추후 구현">마을 · NPC · 퀘스트: 준비 중</span>
  </nav>;
}
