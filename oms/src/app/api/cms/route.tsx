import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ message: "Data received successfully" });
  } catch (error) {
    console.error("Error processing data:", error);
    return NextResponse.json(
      { error: "Failed to process data" },
      { status: 500 }
    );
  }
}
