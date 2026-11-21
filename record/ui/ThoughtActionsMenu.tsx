export type ThoughtAction = {
  id: 'reminder' | 'quiet' | 'connection';
  label: string;
  onPress: () => void;
};

export type ThoughtActionsMenuProps = { actions: ThoughtAction[] };

export function ThoughtActionsMenu(_props: ThoughtActionsMenuProps) {
  return null;
}
