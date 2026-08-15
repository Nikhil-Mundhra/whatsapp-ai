import { listPolls } from "../lib/polls";

export const dynamic = "force-dynamic";

export default async function Home() {
  const polls = await listPolls(100);
  const pending = polls.filter((p) => p.status === "pending");

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Take-over control panel</h1>
      {pending.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16 }}>Pending — answer now</h2>
          {pending.map((p) => (
            <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>{p.contactDisplay} texted you</div>
              <div style={{ color: "#555", margin: "4px 0 12px" }}>{p.question}</div>
              <form action={`/api/polls/${p.id}`} method="POST">
                {p.options.map((opt) => (
                  <button
                    key={opt}
                    type="submit"
                    name="option"
                    value={opt}
                    style={{
                      display: "block", width: "100%", margin: "6px 0", padding: 10,
                      borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer",
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </form>
            </div>
          ))}
        </section>
      )}
      <h2 style={{ fontSize: 16 }}>History</h2>
      {polls.length === 0 && <p style={{ color: "#888" }}>No polls yet.</p>}
      {polls.map((p) => (
        <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div>
            <strong>{p.contactDisplay}</strong>{" "}
            <span style={{ color: "#888" }}>
              {new Date(p.createdAt).toLocaleString()}
            </span>
          </div>
          <div style={{ color: "#555", marginTop: 4 }}>{p.question}</div>
          <div style={{ marginTop: 6, color: p.status === "answered" ? "#0a7d32" : "#888" }}>
            {p.status === "answered"
              ? `Answered: ${p.selectedOption} (via ${p.source})`
              : p.status === "expired"
                ? "Expired — fell back to WhatsApp"
                : "Pending"}
          </div>
        </div>
      ))}
    </main>
  );
}
