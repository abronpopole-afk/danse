import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import RemotePage from "@/pages/remote";
import DebugPage from "@/pages/debug";
import RangesPage from "@/pages/ranges"; // Assuming RangesPage is located at "@/pages/ranges"
import { TooltipProvider } from "@radix-ui/react-tooltip"; // Assuming TooltipProvider is needed for Toaster

function Router() {
  return (
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