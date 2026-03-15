export interface TodoItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ChecklistFile {
  id: string;
  name: string;
  path: string;
  checked: boolean;
  todos: TodoItem[];
}

export interface ChecklistPhase {
  id: string;
  name: string;
  collapsed: boolean;
  files: ChecklistFile[];
}

export interface ChecklistGroup {
  id: string;
  name: string;
  collapsed: boolean;
  phases: ChecklistPhase[];
}

export interface WorkspaceData {
  groups: ChecklistGroup[];
}
