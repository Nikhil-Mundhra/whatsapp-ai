import { NextResponse } from "next/server.js";
import { verifySuperadminSession, getAllUsersOverview } from "../../../../lib/superadmin.js";

export async function GET(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized. Superadmin access required." }, { status: 401 });
  }

  try {
    const overview = await getAllUsersOverview();
    return NextResponse.json(overview);
  } catch (err) {
    console.error("[getAllUsersOverview error]", err);
    return NextResponse.json(
      { error: `Failed to fetch users overview: ${err.message}` },
      { status: 500 }
    );
  }
}
