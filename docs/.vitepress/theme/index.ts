import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import DemoFigure from "./components/DemoFigure.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("DemoFigure", DemoFigure);
  },
} satisfies Theme;
