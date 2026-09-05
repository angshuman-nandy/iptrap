import { useEffect, useState } from "react";
import JsonView from "../JsonView.jsx";

export default function Landing() {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then(setDetails)
      .catch(() => setError("Could not load your details."));
      window.location.replace("https://www.google.com");
  }, []);

  return null;
}
