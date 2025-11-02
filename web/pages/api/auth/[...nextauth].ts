import NextAuth from "next-auth";
import { authOptions } from "../../../lib/authOptions";
import type { NextApiRequest, NextApiResponse } from "next";

export default function auth(req: NextApiRequest, res: NextApiResponse) {
  return NextAuth(req, res, authOptions);
}
