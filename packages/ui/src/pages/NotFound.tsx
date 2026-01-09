import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <>
      <h2>Not found</h2>
      <p>
        <Link to="/">Go home</Link>
      </p>
    </>
  );
}