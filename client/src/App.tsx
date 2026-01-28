import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import RemotePage from "@/pages/remote";
import DebugPage from "@/pages/debug";
import RangesPage from "@/pages/ranges";
import { TooltipProvider } from "@radix-ui/react-tooltip";

function Router() {
  return (
    <WouterRouter hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/live" component={Dashboard} />
        <Route path="/logs" component={Dashboard} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/remote" component={RemotePage} />
        <Route path="/debug" component={DebugPage} />
        <Route path="/ranges" component={RangesPage} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;