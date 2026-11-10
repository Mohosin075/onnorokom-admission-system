import AssessmentApp from "./AssessmentApp";
import PortalApp from "./PortalApp";

// The evaluator gets the PDF workflow by default. Portal is an explicit, separate build mode.
export default function App() {
  return import.meta.env.VITE_APP_MODE?.toLowerCase() === "portal" ? (
    <PortalApp />
  ) : (
    <AssessmentApp />
  );
}
