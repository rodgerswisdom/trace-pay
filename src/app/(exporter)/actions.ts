"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireExporter, signOut } from "@/auth";
import { db } from "@/db";
import { exporters } from "@/db/schema";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function setLanguage(language: "en" | "sw") {
  const exporter = await requireExporter();
  await db.update(exporters).set({ language }).where(eq(exporters.id, exporter.id));
  revalidatePath("/", "layout");
}
