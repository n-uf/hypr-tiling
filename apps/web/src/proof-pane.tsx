import type { ReactElement } from "react";
import { CanvasHeading, CanvasInline, CanvasLead } from "./content-canvas";
import {
  EditorialHeading,
  EditorialInline,
  EditorialLead,
} from "./content-editorial";
import { MosaicInline, SectionHeading, SectionLead } from "./docs";
import type { HomeSkin } from "./page";
import { proofParagraphs } from "./proof-lines";
import type { DocParagraph } from "./docs";

function ProofLines({
  skin,
}: {
  skin: HomeSkin;
}): ReactElement {
  const paragraphs: ReadonlyArray<DocParagraph> = proofParagraphs();
  return (
    <>
      {paragraphs.map(
        (paragraph: DocParagraph, index: number): ReactElement => {
          if (skin === "editorial") {
            return (
              <EditorialLead key={index}>
                <EditorialInline paragraph={paragraph} />
              </EditorialLead>
            );
          }
          if (skin === "canvas") {
            return (
              <CanvasLead key={index}>
                <CanvasInline paragraph={paragraph} />
              </CanvasLead>
            );
          }
          return (
            <SectionLead key={index}>
              <MosaicInline paragraph={paragraph} />
            </SectionLead>
          );
        },
      )}
    </>
  );
}

export function ProofPane({ skin }: { skin: HomeSkin }): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {skin === "editorial" ? (
        <EditorialHeading>Proof</EditorialHeading>
      ) : skin === "canvas" ? (
        <CanvasHeading>Proof</CanvasHeading>
      ) : (
        <SectionHeading>Proof</SectionHeading>
      )}
      <ProofLines skin={skin} />
    </div>
  );
}
