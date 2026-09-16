import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function DocsMarkdown({ text }: { text: string }) {
  return (
    <div className="docs-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
