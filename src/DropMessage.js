import React from "react";

export default function DropMessage(props) {
  return <div hidden={!props.dropzoneProps.isDragActive} className="drop-message-outer">
    <div hidden={!props.dropzoneProps.isDragActive} className="drop-message">
      <div className="drop-message-inner">
        Drop files to play!<br/>
        Formats: .ay .gbs .it .kss .m .m2 .mz .mdx .mid <br/>
        .mod .nsf .nsfe .sgc .spc .s3m .s98 .vgm .vgz .xm
      </div>
    </div>
  </div>;
}
