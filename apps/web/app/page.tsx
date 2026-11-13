const foundations = ['Web', 'Android', 'iOS', 'API', 'Worker'] as const;

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Sprint 3 delivery foundation</p>
      <h1>Film Studio</h1>
      <p className="lede">
        The buildable platform shell is online. Product workflows will be added
        only through their accepted sprint contracts.
      </p>
      <ul aria-label="Platform workspaces">
        {foundations.map((foundation) => (
          <li key={foundation}>{foundation}</li>
        ))}
      </ul>
    </main>
  );
}
