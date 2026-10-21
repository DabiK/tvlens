FROM tvlens-streaming-38c3c15dd2924a16bed873bd8dc8de45:dependencies
RUN python3 -m pip install --disable-pip-version-check --no-input --no-cache-dir --only-binary=:all: --no-deps --retries 0 --timeout 30 https://files.pythonhosted.org/packages/da/71/ae30dadffc90b9006d77af76b393cb9dfbfc9629f339fc1574a1c52e6806/future-1.0.0-py3-none-any.whl#sha256=929292d34f5872e70396626ef385ec22355a1fae8ad29e1a734c3e43f9fbc216
RUN python3 -c "from past.builtins import basestring; import ffmpeg; import importlib.metadata as m; assert m.version('future') == '1.0.0'"
