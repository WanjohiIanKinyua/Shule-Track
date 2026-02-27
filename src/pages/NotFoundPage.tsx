import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="center-page">
      <h1>404</h1>
      <p>Page not found.</p>
      <Link className="btn" to="/">
        Back Home
      </Link>
    </div>
  );
}
