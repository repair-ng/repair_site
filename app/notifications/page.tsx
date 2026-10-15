"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { btn2, Card, Shell, useMe } from "@/components/ui";

export default function Notifications() {
  const { me } = useMe();
  const [list, setList] = useState<any[]>([]);
  const load = () => api("/api/notifications").then((d) => setList(d.notifications));
  useEffect(() => { load(); }, []);
  return (
    <Shell me={me} title="Notifications">
      <button className={`${btn2} mb-3 bg-white`} onClick={async () => { await api("/api/notifications", { body: { all: true } }); load(); }}>Mark all as read</button>
      {list.length === 0 && <Card>No notifications.</Card>}
      {list.map((n) => (
        <Card key={n.id} className={n.read ? "opacity-60" : ""}>
          <div className="text-sm font-semibold">{n.title}</div><div className="text-sm">{n.body}</div>
          <div className="mt-1 text-xs text-ink/50">{new Date(n.createdAt).toLocaleString()}</div></Card>))}
    </Shell>
  );
}
