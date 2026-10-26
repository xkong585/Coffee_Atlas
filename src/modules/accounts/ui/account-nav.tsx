"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionState } from "@/contracts";
import { callApi, dataOf } from "./client";

/** Header link: "Sign in" until the session says otherwise. Re-checked on each navigation. */
export function AccountNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check the session after every navigation (sign-in, sign-out).
  useEffect(() => {
    let active = true;
    void callApi<SessionState>("/api/session").then((reply) => {
      if (active) setSignedIn(dataOf(reply)?.status === "signed-in");
    });
    return () => { active = false; };
  }, [pathname]);

  return signedIn
    ? <Link className="sign-in-link" href="/account">Account <span aria-hidden="true">↗</span></Link>
    : <Link className="sign-in-link" href="/login">Sign in <span aria-hidden="true">↗</span></Link>;
}
