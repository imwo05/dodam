export function GardenView({ garden }: { garden: unknown }) {
  const hasGardenData = Boolean(garden && typeof garden === 'object' && Object.keys(garden as object).length);
  return (
    <section className="garden-view" aria-label="다람쥐의 정원">
      <div className="garden-view__boundary" aria-hidden="true"><span>garden</span></div>
      <div>
        <h2>다람쥐의 정원</h2>
        <p>{hasGardenData ? '정원 데이터를 불러왔어요. 다음 단계에서 공간을 꾸밀 수 있어요.' : '정원 공간은 준비 중이에요.'}</p>
      </div>
    </section>
  );
}
