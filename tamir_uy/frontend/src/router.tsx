import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  type RouteObject,
} from "react-router-dom";
import { getToken } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";

// ---------- Auth guard ----------

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

// ---------- Skeleton fallback ----------

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="space-y-3 w-full max-w-md px-4">
        <div className="h-8 bg-gray-200 rounded-card animate-pulse" />
        <div className="h-4 bg-gray-200 rounded-card animate-pulse w-3/4" />
        <div className="h-4 bg-gray-200 rounded-card animate-pulse w-1/2" />
        <div className="mt-6 h-48 bg-gray-200 rounded-card animate-pulse" />
      </div>
    </div>
  );
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{node}</Suspense>;
}

// ---------- 404 ----------

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-6xl font-extrabold text-brand">404</h1>
      <p className="text-muted text-lg">Sahifa topilmadi</p>
      <a
        href="/projects"
        className="bg-brand text-white px-6 py-2.5 rounded-card font-semibold hover:bg-brand/90 transition-colors"
      >
        Bosh sahifaga qaytish
      </a>
    </div>
  );
}

// ---------- Lazy pages ----------

const WizardPage = lazy(() => import("@/pages/wizard/WizardPage"));
const StudioPage = lazy(() => import("@/pages/studio/StudioPage"));
const ThreeDPage = lazy(() => import("@/pages/studio/ThreeDPage"));
const PlacementPage = lazy(() => import("@/pages/studio/PlacementPage"));
const WalkthroughPage = lazy(() => import("@/pages/studio/WalkthroughPage"));
const SmetaPage = lazy(() => import("@/pages/smeta/SmetaPage"));
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage"));
const DokonPage = lazy(() => import("@/pages/dokon/DokonPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));

// ---------- Routes ----------

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Navigate to="/projects" replace />,
  },
  {
    path: "/login",
    element: withSuspense(<LoginPage />),
  },

  // ── Main shell (Uy + Do'kon bottom nav) ──
  {
    element: <AppShell />,
    children: [
      {
        path: "/projects",
        element: withSuspense(<RequireAuth><ProjectsPage /></RequireAuth>),
      },
      {
        path: "/dokon",
        element: withSuspense(<DokonPage />),
      },
      {
        path: "/profile",
        element: withSuspense(<ProfilePage />),
      },
    ],
  },

  // ── Full-screen flows (no bottom nav) ──
  {
    path: "/wizard",
    element: withSuspense(<RequireAuth><WizardPage /></RequireAuth>),
  },
  {
    path: "/studio/:roomId",
    element: withSuspense(<RequireAuth><StudioPage /></RequireAuth>),
    children: [
      {
        index: true,
        element: <Navigate to="ichkarida" replace />,
      },
      {
        path: "ichkarida",
        element: withSuspense(<ThreeDPage />),
      },
      {
        path: "elektr",
        element: withSuspense(<PlacementPage />),
      },
      {
        path: "aylanish",
        element: withSuspense(<WalkthroughPage />),
      },
    ],
  },
  {
    path: "/smeta/:roomId",
    element: withSuspense(<RequireAuth><SmetaPage /></RequireAuth>),
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
];

export const router = createBrowserRouter(routes);
