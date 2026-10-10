# Find affordance study

`FindAffordancePreview.tsx` is an isolated native component. The production Record does not import it. To inspect it in a disposable development entry, place it over a Record-like surface and pass the actual width, font scale, safe-area top, anchor, focus, and keyboard states. Pass the existing `setInput` and capture input ref's `focus` to the preview. Its tap sets `/` and focuses the existing Find field. Reserve `findPreviewLayout(...).pullResponderRightInset` on the Settings pull responder while the preview is visible. This avoids competing for the same touches.

The study hides the upper-right label when the date anchor, Focus, keyboard, narrow viewport, or enlarged text would compete with it. In those states, the contextual `Start with / to find` guidance at the capture field is the safer candidate. Neither option is enabled in the production Record.
