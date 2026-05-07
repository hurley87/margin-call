"use client";

import dynamic from "next/dynamic";

const WireAdminClient = dynamic(() => import("./wire-admin-client"), {
  ssr: false,
});

export default function WireAdminPage() {
  return <WireAdminClient />;
}
