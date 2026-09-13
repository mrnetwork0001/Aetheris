"use client";

import * as React from "react";

import { useRole } from "./role-context";

export interface RoleSwitchProps {
  operator: React.ReactNode;
  client: React.ReactNode;
}

/** Renders the operator or the client workspace for the current role. */
export function RoleSwitch({ operator, client }: RoleSwitchProps) {
  const { role } = useRole();
  return <>{role === "client" ? client : operator}</>;
}

export function OperatorOnly({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  return role === "operator" ? <>{children}</> : null;
}

export function ClientOnly({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  return role === "client" ? <>{children}</> : null;
}
