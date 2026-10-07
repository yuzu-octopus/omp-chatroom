import type { AgentToolResult, ToolRenderResultOptions } from "@oh-my-pi/pi-coding-agent";
import { compact, elapsed, span, text } from "@oh-my-pi/pi-tui";   // TSP builders (native/describe)
import type { NativeToolView } from "@oh-my-pi/pi-tui/tools/renderer";
import { renderStatusLine } from "@oh-my-pi/pi-tui/render/status-line";
import type { Component, Theme } from "@oh-my-pi/pi-tui";
import type { RoomParams, RoomToolDetails } from "../tools/room";
import type { WaitForAgentDetails } from "../tools/wait-for-agent";
import type { WaitForClaimDetails } from "../tools/wait-for-claim";
import type { WaitForMessageDetails } from "../tools/wait-for-message";
export function renderRoomCall(args: RoomParams, options: ToolRenderResultOptions, theme: Theme): Component {
  throw new Error("not implemented");
}
export function renderRoomResult(result: AgentToolResult<RoomToolDetails>,
                                 options: ToolRenderResultOptions, theme: Theme,
                                 args?: RoomParams): Component {
  throw new Error("not implemented");
}
export function describeRoomCall(args: RoomParams, options: ToolRenderResultOptions): NativeToolView | undefined {
  throw new Error("not implemented");
}
export function describeRoomResult(result: AgentToolResult<RoomToolDetails>,
                                   options: ToolRenderResultOptions,
                                   args?: RoomParams): NativeToolView | undefined {
  throw new Error("not implemented");
}

// The three wait tools share one card pair; names are scaffold-invented.
// K13 — typed, not `unknown`: the union of the three `details` payloads.
export type WaitDetails = WaitForAgentDetails | WaitForMessageDetails | WaitForClaimDetails;   // [invented]
export function renderWaitCall(args: Record<string, unknown>, options: ToolRenderResultOptions, theme: Theme): Component {
  throw new Error("not implemented");
}
export function renderWaitResult(result: AgentToolResult<WaitDetails>,
                                 options: ToolRenderResultOptions, theme: Theme,
                                 args?: Record<string, unknown>): Component {
  throw new Error("not implemented");
}
export function describeWaitCall(args: Record<string, unknown>, options: ToolRenderResultOptions): NativeToolView | undefined {
  throw new Error("not implemented");
}
export function describeWaitResult(result: AgentToolResult<WaitDetails>,
                                   options: ToolRenderResultOptions,
                                   args?: Record<string, unknown>): NativeToolView | undefined {
  throw new Error("not implemented");
}
