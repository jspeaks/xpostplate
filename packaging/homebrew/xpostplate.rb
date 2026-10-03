# Head-only until the first GitHub release. On that release, replace `head`
# with the GitHub tag archive URL and the real sha256 of that tarball.
# `brew install xpostplate` stays blocked until this formula lives in a tap.
# It is not in homebrew-core.
# Licensed MIT. Still not a homebrew-core formula.
class Xpostplate < Formula
  desc "Render or fabricate an X post as a PNG"
  homepage "https://github.com/jspeaks/xpostplate"
  head "https://github.com/jspeaks/xpostplate.git", branch: "main"

  depends_on "imagemagick"
  depends_on "node"

  def install
    libexec.install "assets", "bin", "fixtures", "lib", "package.json"
    (bin/"xpostplate").write <<~SH
      #!/bin/bash
      export PATH="#{Formula["node"].opt_bin}:#{Formula["imagemagick"].opt_bin}:${PATH}"
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/xpostplate.js" "$@"
    SH
  end

  test do
    assert_match(/^\d+\.\d+\.\d+/, shell_output("#{bin}/xpostplate --version"))
  end
end
