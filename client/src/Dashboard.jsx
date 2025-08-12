import { useEffect, useState, useCallback } from "react";
import LoginButton from './components/LoginButton';
import { auth, db } from './firebase';
import { collection, getDocs, onSnapshot, query, orderBy } from "firebase/firestore";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [icalUrl, setIcalUrl] = useState("");
  const [icalUrls, setIcalUrls] = useState([]);
  const [smsReplies, setSmsReplies] = useState({});
  const [cleaners, setCleaners] = useState({});
  const [expanded, setExpanded] = useState(null);

  // NEW: cleanings (live)
  const [cleanings, setCleanings] = useState([]);
  // NEW: expand per-cleaning timeline panel
  const [expandTimeline, setExpandTimeline] = useState(null);

  // ---------- helpers ----------
  const digits = (n) => (n || "").toString().replace(/\D/g, "");
  const canonical10 = (n) => {
    let d = digits(n);
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    return d;
  };
  const toE164 = (n) => (canonical10(n)?.length === 10 ? `+1${canonical10(n)}` : n);
  const maskPhone = (n) => {
    const d10 = canonical10(n);
    return d10 && d10.length === 10 ? `(${d10.slice(0,3)}) ${d10.slice(3,6)}-${d10.slice(6)}` : n || "-";
  };
  const findCleanerName = (phone) => {
    const d10 = canonical10(phone);
    if (!d10) return null;

    if (cleaners[phone]) return cleaners[phone].name || null;
    if (cleaners[toE164(phone)]) return cleaners[toE164(phone)].name || null;
    if (cleaners[d10]) return cleaners[d10].name || null;

    for (const key of Object.keys(cleaners)) {
      if (canonical10(key) === d10) return cleaners[key].name || null;
    }
    return null;
  };
  const tz = "America/New_York";
  const fmtWhen = (val) => {
    const d = val ? new Date(val) : null;
    if (!d || isNaN(d)) return "-";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "short", day: "2-digit",
      hour: "numeric", minute: "2-digit"
    }).format(d);
  };

  const statusBadge = (status) => {
    const base = "inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium";
    switch ((status || "").toLowerCase()) {
      case "confirmed":
        return `${base} bg-green-100 text-green-800`;
      case "assigned":
        return `${base} bg-blue-100 text-blue-800`;
      case "partial":
        return `${base} bg-amber-100 text-amber-800`;
      case "declined":
        return `${base} bg-rose-100 text-rose-800`;
      default:
        return `${base} bg-gray-100 text-gray-800`;
    }
  };

  // ---------- data fetching ----------
  const fetchCleaners = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, "cleaners"));
    const result = {};
    snapshot.forEach(doc => {
      result[doc.id] = doc.data(); // doc.id = phone number (various formats)
    });
    setCleaners(result);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;

      // keep these light (legacy placeholders)
      await Promise.all([
        fetch("/cleanings.json").catch(() => ({ json: async () => [] })),
        fetch("/smsReplies.json").catch(() => ({ json: async () => [] }))
      ]);

      if (token) {
        const icalListRes = await fetch("http://localhost:3000/ical", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (icalListRes.ok) {
          const icalData = await icalListRes.json();
          setIcalUrls(icalData.icalUrls || []);
        }
      }

      await fetchCleaners();
      setLoading(false);
    } catch (err) {
      console.error("❌ Error fetching dashboard data:", err);
    }
  }, [fetchCleaners]);

  const syncCalendar = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return alert("❌ Not logged in");

    const token = await user.getIdToken();

    try {
      const res = await fetch("/sync-calendar", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await res.json();
      if (result.success) {
        console.log(`✅ Synced ${result.count} events`);
        fetchAll();
      } else {
        alert("⚠️ Sync failed: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      console.error("❌ Manual sync failed:", err);
    }
  }, [fetchAll]);

  const triggerCleanerScheduling = async () => {
    const user = auth.currentUser;
    if (!user) return alert("❌ Not logged in");

    const token = await user.getIdToken();

    try {
      const res = await fetch("http://localhost:3000/api/schedule-cleanings", { // ✅ fixed path
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await res.json();
      if (result.success) {
        alert(`✅ Scheduled messages for ${result.count} upcoming cleanings`);
      } else {
        alert("⚠️ Scheduling failed: " + (result.error || "Unknown error"));
      }
    } catch (err) {
      console.error("❌ Scheduling error:", err);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      // Real-time listener for smsReplies
      const smsRef = collection(db, "users", user.uid, "smsReplies");
      const unsubscribeSms = onSnapshot(smsRef, (snapshot) => {
        const updatedReplies = {};
        snapshot.forEach(doc => {
          updatedReplies[doc.id] = doc.data().messages || [];
        });
        setSmsReplies(updatedReplies);
      });

      // NEW: Real-time listener for cleanings (order by start if present)
      const cleaningsRef = collection(db, "users", user.uid, "cleanings");
      const q = query(cleaningsRef, orderBy("start"));
      const unsubscribeCleanings = onSnapshot(q, (snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setCleanings(list);
      });

      await syncCalendar();

      return () => {
        unsubscribeSms();
        unsubscribeCleanings();
      };
    });

    fetchAll();
    const interval = setInterval(fetchAll, 30000);

    return () => {
      unsubscribeAuth();
      clearInterval(interval);
    };
  }, [fetchAll, syncCalendar]);

  async function handleSaveIcalUrl() {
    const user = auth.currentUser;
    if (!user) return alert("❌ Not logged in");
    const token = await user.getIdToken();

    const res = await fetch("http://localhost:3000/ical", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ icalUrl }),
    });

    const result = await res.json();
    if (result.success) {
      alert("✅ iCal URL saved!");
      setIcalUrl("");
      fetchAll();
    } else {
      alert("❌ Failed to save iCal URL");
    }
  }

  async function handleDeleteIcalUrl(urlToDelete) {
    const user = auth.currentUser;
    if (!user) return alert("❌ Not logged in");
    const token = await user.getIdToken();

    const res = await fetch("http://localhost:3000/ical", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ icalUrl: urlToDelete }),
    });

    const result = await res.json();
    if (result.success) {
      alert("🗑️ iCal URL deleted.");
      fetchAll();
    } else {
      alert("❌ Failed to delete iCal URL");
    }
  }

  if (loading) return <div className="p-10 text-center">⏳ Loading...</div>;

  // ---------- derived views ----------
  const upcoming = [...cleanings].filter(c => {
    const when = c.start || c.date;
    return when && new Date(when) > new Date();
  }).sort((a, b) => new Date(a.start || a.date) - new Date(b.start || b.date));

  // Build per-role info for the Timeline panel
  const roleBlocks = (c) => {
    const roles = [
      { label: "Primary", phone: c.primaryPhone },
      { label: "Backup", phone: c.backupPhone },
      { label: "Secondary", phone: c.secondaryPhone },
    ];
    const invitedPhones = c.invitedPhones || {}; // { canonical10: timestamp }
    const inviteCycle = c.inviteCycleStartedAt;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        {roles.map((r, idx) => {
          const d10 = canonical10(r.phone);
          let invitedAt = null;
          if (d10 && invitedPhones[d10]) invitedAt = invitedPhones[d10];
          else {
            for (const k of Object.keys(invitedPhones)) {
              if (k === d10) { invitedAt = invitedPhones[k]; break; }
            }
          }
          const name = findCleanerName(r.phone);
          const statusLines = [];
          if (invitedAt) statusLines.push(`Invited: ${fmtWhen(invitedAt)}`);
          if (inviteCycle) statusLines.push(`Cycle: ${fmtWhen(inviteCycle)}`);

          return (
            <div key={idx} className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">{r.label}</div>
              <div className="font-medium mt-0.5">{name || "—"}</div>
              <div className="text-sm text-gray-600">{r.phone ? maskPhone(r.phone) : "—"}</div>
              <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                {statusLines.length ? statusLines.map((s, i) => <div key={i}>{s}</div>) : <div>—</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 px-6 py-10">
      <div className="space-y-10 w-full">
        <LoginButton />

        {/* iCal Controls */}
        <div className="space-y-2">
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="text"
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="Paste your iCal URL"
              className="p-2 border border-gray-300 rounded w-full max-w-md"
            />
            <button onClick={handleSaveIcalUrl} className="bg-blue-500 text-white px-4 py-2 rounded">Save iCal URL</button>
            <button onClick={syncCalendar} className="bg-green-600 text-white px-4 py-2 rounded">🔄 Sync Calendar</button>
            <button onClick={triggerCleanerScheduling} className="bg-purple-600 text-white px-4 py-2 rounded">🧪 Trigger Cleaner Scheduling</button>
          </div>

          {icalUrls.length > 0 && (
            <div className="text-sm text-gray-600">
              <strong>Saved iCal URLs:</strong>
              <ul className="list-disc list-inside space-y-1">
                {icalUrls.map((url, i) => (
                  <li key={i} className="break-all flex items-center gap-2">
                    <span>{url}</span>
                    <button
                      onClick={() => handleDeleteIcalUrl(url)}
                      className="text-red-500 hover:text-red-700 text-xs underline"
                    >
                      🗑️ Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* NEW: Upcoming Jobs — Status Heatmap */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">📅 Upcoming Cleanings</h2>
          {upcoming.length === 0 ? (
            <p className="text-gray-500 italic">No upcoming cleanings.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {upcoming.map((c) => {
                const when = c.start || c.date;
                return (
                  <div key={c.id} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm text-gray-500">Property</div>
                        <div className="text-base font-semibold">{c.property || "Untitled"}</div>
                      </div>
                      <span className={statusBadge(c.status)}>{c.status || "Unassigned"}</span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs uppercase tracking-wide">When</div>
                        <div className="font-medium">{fmtWhen(when)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase tracking-wide">Assigned</div>
                        <div className="font-medium">
                          {findCleanerName(c.primaryPhone) || maskPhone(c.primaryPhone) || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase tracking-wide">Backup</div>
                        <div className="font-medium">
                          {findCleanerName(c.backupPhone) || maskPhone(c.backupPhone) || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs uppercase tracking-wide">Secondary</div>
                        <div className="font-medium">
                          {findCleanerName(c.secondaryPhone) || maskPhone(c.secondaryPhone) || "—"}
                        </div>
                      </div>
                    </div>

                    <button
                      className="mt-3 text-sm text-blue-600 hover:underline"
                      onClick={() => setExpandTimeline(expandTimeline === c.id ? null : c.id)}
                    >
                      {expandTimeline === c.id ? "Hide Timeline" : "View Response Timeline"}
                    </button>

                    {expandTimeline === c.id && (
                      <div className="mt-3">
                        <div className="text-xs text-gray-500">
                          Invite cycle started: <span className="font-medium">{fmtWhen(c.inviteCycleStartedAt)}</span>
                        </div>
                        {roleBlocks(c)}
                        <div className="mt-3 text-xs text-gray-500">
                          <span className="font-medium">Notes:</span>{" "}
                          Only cleaners invited in the current cycle (after the timestamp above) will receive a slot‑filled notice if someone else confirms.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Existing: Real-time SMS Inbox */}
        <div className="mt-10 space-y-4">
          <h2 className="text-lg font-bold">📨 Cleaner SMS Inbox (Real-Time)</h2>
          {Object.entries(smsReplies).length === 0 ? (
            <p className="text-gray-500 italic">No replies yet.</p>
          ) : (
            Object.entries(smsReplies).map(([phone, messages]) => {
              const last = messages[messages.length - 1];
              const isOpen = expanded === phone;

              const cleaner = cleaners[phone] || {};
              const avatarUrl = cleaner.avatarUrl
                ? cleaner.avatarUrl.startsWith("http")
                  ? cleaner.avatarUrl
                  : `http://localhost:3000${cleaner.avatarUrl}`
                : "/avatars/default-avatar.png";

              const name = cleaner.name || phone;

              return (
                <div
                  key={phone}
                  className="p-3 border rounded bg-white shadow-sm cursor-pointer"
                  onClick={() => setExpanded(expanded === phone ? null : phone)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <img src={avatarUrl} alt={`Avatar of ${name}`} className="w-6 h-6 rounded-full object-cover" />
                    <strong>{name}</strong>
                    <span className="text-xs text-gray-500 ml-1">{maskPhone(phone)}</span>
                  </div>
                  <p className="text-sm">{last?.message}</p>
                  <small className="text-xs text-gray-500">
                    {last?.timestamp && new Date(last.timestamp).toLocaleString()}
                  </small>

                  {isOpen && messages.length > 1 && (
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      {messages.slice(0, -1).map((msg, idx) => (
                        <div key={idx} className="border-t pt-1">
                          <p>{msg.message}</p>
                          <small className="text-xs">
                            {msg.timestamp && new Date(msg.timestamp).toLocaleString()}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
