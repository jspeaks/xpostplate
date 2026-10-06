# Tap formula for xpostplate (not in homebrew-core).
# Stable installs the tagged GitHub release; `brew install --HEAD` tracks main.
class Xpostplate < Formula
  desc "Render or fabricate an X post as a PNG"
  homepage "https://github.com/jspeaks/xpostplate"
  url "https://github.com/jspeaks/xpostplate/archive/refs/tags/v0.9.26.tar.gz"
  sha256 "b8f1af8b49afdd39189cbd2315d8e4a6ae1c4fe485ee9512b4df7efd82022178"
  license "MIT"
  head "https://github.com/jspeaks/xpostplate.git", branch: "main"

  depends_on "node"

  def install
    libexec.install "assets", "bin", "fixtures", "lib", "package.json", "package-lock.json"
    pkgshare.install "skills"
    # Rendering deps (@resvg/resvg-js, sharp) ship prebuilt binaries as optional
    # per-platform packages; no install scripts or system libraries are needed.
    cd libexec do
      system "npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
             "--cache=#{HOMEBREW_CACHE}/npm_cache"
    end
    (bin/"xpostplate").write <<~SH
      #!/bin/bash
      export PATH="#{formula_opt_bin("node")}:${PATH}"
      exec "#{formula_opt_bin("node")}/node" "#{libexec}/bin/xpostplate.js" "$@"
    SH
  end

  def caveats
    <<~EOS
      Agent skill ships at:
        #{opt_pkgshare}/skills/xpostplate/SKILL.md
      Symlink that folder into your agent skills directory (e.g. ~/.agents/skills/xpostplate).
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/xpostplate --version") unless version.head?
    assert_match(/^\d+\.\d+\.\d+/, shell_output("#{bin}/xpostplate --version"))
    system bin/"xpostplate", "--fixture", "-o", testpath/"plate.png"
    assert_path_exists testpath/"plate.png"
  end
end
