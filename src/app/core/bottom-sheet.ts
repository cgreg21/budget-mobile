import { Application, Device, isAndroid, isIOS, Screen, View } from '@nativescript/core';

/** Presentation options that make a NativeScript modal a bottom sheet on iOS (Android is handled by `dockToBottom`). */
export function sheetModalOptions(): { fullscreen: false; ios?: { presentationStyle: number } } {
  return {
    fullscreen: false,
    ios: isIOS ? { presentationStyle: UIModalPresentationStyle.PageSheet } : undefined,
  };
}

/** A modal is not a child of the root view, so it does not inherit the theme class. */
export function sheetThemeClass(): string {
  return Application.getRootView()?.cssClasses.has('ns-light') ? 'ns-light' : 'ns-dark';
}

/** Height available to the scrollable body of a sheet. */
export function sheetBodyHeight(ratio: number): number {
  return Math.round(Screen.mainScreen.heightDIPs * ratio);
}

/** iOS: sizes the page sheet to its content (custom detent on iOS 16+, medium detent on iOS 15). */
function fitIosSheetToContent(view: View): void {
  const controller = (view as unknown as { viewController?: UIViewController }).viewController;
  const content = (view as unknown as { getChildAt(index: number): View | undefined }).getChildAt(0);
  const sheet = controller?.presentationController as UISheetPresentationController | undefined;
  if (!controller || !content || !sheet || typeof sheet.detents === 'undefined') return;

  if (parseFloat(Device.osVersion) < 16) {
    sheet.detents = NSArray.arrayWithObject(UISheetPresentationControllerDetent.mediumDetent());
    return;
  }

  let height = 0;
  content.verticalAlignment = 'bottom';
  const detent = UISheetPresentationControllerDetent.customDetentWithIdentifierResolver('content', (context) =>
    Math.min(height || context.maximumDetentValue, context.maximumDetentValue),
  );
  sheet.detents = NSArray.arrayWithObject(detent);
  sheet.selectedDetentIdentifier = 'content';

  const update = (): void => {
    const bottomInset = controller.view?.safeAreaInsets?.bottom ?? 0;
    const next = Math.ceil(content.getActualSize().height + bottomInset);
    if (next > 0 && next !== height) {
      height = next;
      sheet.invalidateDetents();
    }
  };
  content.on(View.layoutChangedEvent, update);
  view.once(View.unloadedEvent, () => content.off(View.layoutChangedEvent, update));
  update();
}

/**
 * Makes the modal a bottom sheet fitted to its content. Android: full width, glued to the bottom edge,
 * over a transparent window so the rounded top corners show, and resized when the keyboard opens.
 */
export function dockToBottom(view: View): void {
  if (isIOS) {
    fitIosSheetToContent(view);
    return;
  }
  if (!isAndroid) return;
  const apply = (): boolean => {
    const dialog = (view as unknown as { _dialogFragment?: { getDialog(): android.app.Dialog | null } })._dialogFragment?.getDialog();
    const window = dialog?.getWindow();
    if (!window) return false;
    window.setGravity(android.view.Gravity.BOTTOM);
    window.setLayout(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
    window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
    window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    return true;
  };
  if (!apply()) setTimeout(apply, 50);
}
