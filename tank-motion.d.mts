export type Position = { x:number; y:number; a:number };
export type Command = { seq:number; move:number; heading:number };
export type Wall = { x:number; y:number; w:number; h:number };
export type Arena = { width:number; height:number; radius:number };
export const STEP_MS:number;
export const MAX_PENDING:number;
export function advanceTank(position:Position,input:{move:number;heading:number},walls:Wall[],speed:number,others?:{x:number;y:number}[],arena?:Arena):Position;
export function replayTank(position:Position,pending:Command[],walls:Wall[],speed:number,others?:{x:number;y:number}[],arena?:Arena):Position;
