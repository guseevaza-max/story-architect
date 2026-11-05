import type { ReactNode } from "react";
import CoauthorDock from "./_components/CoauthorDock";

/**
 * Общая оболочка страниц проекта. Панель Соавтора доступна с любой из них.
 * Права проверяет API: без входа или в чужом проекте панель скрывается сама.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      {children}
      <CoauthorDock projectId={id} />
    </>
  );
}
