import { Link, Redirect, Route, Switch } from "wouter";
import Index from "./pages/index";
import AuthPage from "./pages/auth";
import PricingPage from "./pages/pricing";
import BoardPage from "./pages/board";
import TrackerPage from "./pages/tracker";
import ResumePage from "./pages/resume";
import { Provider } from "./components/provider";
import { ProtectedRoute } from "./components/protected-route";
import { AgentFeedback } from "@runablehq/website-runtime";
import { NO_AUTH, SHOW_PRICING } from "./lib/flags";

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Index} />
        <Route path="/pricing">{SHOW_PRICING ? <PricingPage /> : <Redirect to="/" />}</Route>
        <Route path="/auth">{NO_AUTH ? <Redirect to="/board" /> : <AuthPage />}</Route>
        <Route path="/board">
          <ProtectedRoute>
            <BoardPage />
          </ProtectedRoute>
        </Route>
        <Route path="/tracker">
          <ProtectedRoute>
            <TrackerPage />
          </ProtectedRoute>
        </Route>
        <Route path="/resume">
          <ProtectedRoute>
            <ResumePage />
          </ProtectedRoute>
        </Route>
        {/* Without a fallback, a mistyped or stale link rendered an empty white page. */}
        <Route>
          <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="text-muted-foreground">That link doesn't go anywhere.</p>
            <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
              Back to Job Lock
            </Link>
          </div>
        </Route>
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
