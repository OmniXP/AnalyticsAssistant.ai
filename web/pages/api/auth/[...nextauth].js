// web/pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import { authOptions } from "../../../lib/authOptions";

export default function auth(req, res) {
  return NextAuth(req, res, authOptions);
}
