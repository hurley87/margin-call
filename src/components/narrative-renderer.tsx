interface NarrativeRendererProps {
  narrative: string | { event: string; description: string }[];
}

export function NarrativeRenderer({ narrative }: NarrativeRendererProps) {
  if (typeof narrative === "string") {
    return <>{narrative}</>;
  }

  return (
    <>
      {narrative.map((n, i) => (
        <p key={i} className="mb-1">
          <strong>{n.event}:</strong> {n.description}
        </p>
      ))}
    </>
  );
}
