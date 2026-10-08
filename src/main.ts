import {
  bootstrapApplication,
  provideNativeScriptHttpClient,
  provideNativeScriptRouter,
  registerElement,
  runNativeScriptAngularApp,
} from '@nativescript/angular';
import { install as installCharts, LineChart, PieChart } from '@nativescript-community/ui-chart';
import { provideZonelessChangeDetection } from '@angular/core';
import { withInterceptorsFromDi } from '@angular/common/http';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { initDatabase } from './app/core/database';
import { installCanvasPolyfills } from './app/shared/canvas-polyfill';

installCanvasPolyfills();
installCharts();
registerElement('PieChart', () => PieChart);
registerElement('LineChart', () => LineChart);

runNativeScriptAngularApp({
  appModuleBootstrap: async () => {
    // The services read the database synchronously, so it has to be loaded first.
    await initDatabase();
    return bootstrapApplication(AppComponent, {
      providers: [
        provideNativeScriptHttpClient(withInterceptorsFromDi()),
        provideNativeScriptRouter(routes),
        provideZonelessChangeDetection(),
      ],
    });
  },
});
