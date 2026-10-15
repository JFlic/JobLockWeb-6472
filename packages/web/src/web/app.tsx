import { Route, Switch } from "wouter";
import Index from "./pages/index";
import AuthPage from "./pages/auth";
import PricingPage from "./pages/pricing";
import BoardPage from "./pages/board";
import TrackerPage from "./pages/tracker";
import ResumePage from "./pages/resume";
import { Provider } from "./components/provider";
import { ProtectedRoute } from "./components/protected-route";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Index} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/auth" component={AuthPage} />
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
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
