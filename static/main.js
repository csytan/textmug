Editor = {
    editable: true,
    password: null,
    cipherJSON: null,
    saved: true,
    locked: false,
    encrypted: false,
    public: true,
    undoStack: []
};

Editor.init = function(container, options){
    var self = this;
    self.container = container;
    if (options){
        $.extend(self, options);
        self.locked = self.encrypted ? true : false;
    }

    // Editor
    self.updateView();
    var text = container.textContent || container.innerText;
    container.innerHTML = self.textToHTML(text);

    $(container)
        .on('keydown', null, 'meta+s', self.save)
        .on('keydown', null, 'ctrl+s', self.save)
        .on('keydown', null, 'meta+z', self.undo)
        .on('keydown', null, 'ctrl+z', self.undo)
        .on('keydown', null, 'meta+shift+z', self.redo)
        .on('keydown', null, 'ctrl+shift+z', self.redo)
        // TODO: Shit + tab in a list element
        .keydown(self.keydown)
        .keyup(self.keyup)
        .on('click', function(){
            Editor.updateActive();
        })
        .on('click', 'a', function(){
            window.open(this.href, '_blank');
        })
        .blur(self.blur)
        .focus();

    // Controls
    $('.unlocked').click(self.lock);
    $('#page_name').keyup(function(){
        var value = this.value.toLowerCase()
            .replace(/\s+/, '-')
            .replace(/[^a-z0-9\_\.-]+/, '');
        if (value !== this.value){
            this.value = value;
        }
    });
    $('.save').click(self.save);
    $('.delete').click(self.delete);
    $('.settings').click(function(){
        $('#settings_dialog')
            .toggle()
            .find('input[type="password"]')
                .val(self.password)
            .end()
            .find('select[name="public"] option[value="' + self.public + '"]')
                .prop('selected', true)
            .end()
            .find('select[name="encrypted"] option[value="' + self.encrypted + '"]')
                .prop('selected', true)
                .closest('select')
                .change();
        if (self.locked){
            $('#decrypt_dialog').toggle();
            $('#settings_dialog .encryption').hide();
        } else {
            $('#editor').toggle();
            $('#settings_dialog .encryption').show();
        }
        return false;
    });

    // Dialogs
    $('#settings_dialog')
        .submit(self.saveSettings)
        .find('select[name="encrypted"]')
            .change(function(){
                var encrypted = $(this).find('option:selected').val();
                if (encrypted === 'true'){
                    $('.encrypt_password').show();
                } else {
                    $('.encrypt_password').hide();
                }
            });
    $('.lock').click(self.lock);
    $('.unlock').click(self.unlock);
    $('.close').click(function(){
        $(this).closest('.dialog').hide();
        if (self.locked){
            $('#decrypt_dialog').show();
        } else {
            $('#editor').show();
        }
        return false;
    });
};

Editor.keydown = function(e){
    if (e.keyCode !== 91 /* Command */ && !e.metaKey) {
        Editor.saveUndoState();
    }


    // Tab key
    // Tab in a list element
    if (e.keyCode === 9){
        var editor = document.getElementById('editor');
        var caret = Editor.getCaretPosition();
        var container = caret.node;
        var text = container.textContent || container.innerText;
        // Insert 4 spaces at first offset
        text = text.slice(0, caret.offset) + '    ' + text.slice(caret.offset);
        // Increment caret position
        caret.offset += 4;

        for (var cIndex=0, n=container; n=n.previousSibling; cIndex++);
        var newContainer = document.createElement('div');
        editor.replaceChild(newContainer, container);
        var html = Editor.textToHTML(text);
        newContainer.outerHTML = html;

        Editor.saved = false;
        $('.save').css('display', 'inline-block');

        newContainer = editor.childNodes[cIndex];
        Editor.setCaretPosition(newContainer, caret.offset);
        Editor.updateActive();
        return false;
    }

    // Return key browser normalization.
    // Browsers use different elements as their 'empty' element:
    // http://lists.whatwg.org/pipermail/whatwg-whatwg.org/2011-May/031577.html

    // TODO: Enter , with prev element being list 

    if (e.keyCode === 13){
        var editor = document.getElementById('editor');
        var range = window.getSelection().getRangeAt(0);
        if (!range.collapsed) range.deleteContents();
        var caret = Editor.getCaretPosition();
        var container = caret.node;
        var text = container.textContent || container.innerText;

        // Insert newline at first offset
        text = text.slice(0, caret.offset) + '\n' + text.slice(caret.offset);
        // Increment caret position
        caret.offset++;

        for (var cIndex=0, n=container; n=n.previousSibling; cIndex++);

        var newContainer = document.createElement('div');
        editor.replaceChild(newContainer, container);
        var html = Editor.textToHTML(text);
        newContainer.outerHTML = html;

        Editor.saved = false;
        $('.save').css('display', 'inline-block');

        newContainer = editor.childNodes[cIndex];
        Editor.setCaretPosition(newContainer, caret.offset);
        Editor.updateActive();
        return false;
    }

    Editor.updateActive();
};

Editor.keyup = function(e){
    // Skip events that don't change text or are handled elsewhere
    if (e.keyCode === 13 || /* Enter */
        e.keyCode === 16 || /* Shift */
        e.keyCode === 91 || /* Command */
        e.keyCode >= 37 && e.keyCode <= 40 /* Arrow keys */){
        Editor.updateActive();
        return;
    }

    var editor = document.getElementById('editor');
    var caret = Editor.getCaretPosition();
    var container = caret.node;
    var containerIndex = Array.prototype.indexOf.call(editor.childNodes, container);
    var text = container.textContent || container.innerText;
    var html = Editor.textToHTML(text);

    var newContainer = document.createElement('div');
    editor.replaceChild(newContainer, container);
    newContainer.outerHTML = html;

    Editor.saved = false;
    $('.save').css('display', 'inline-block');

    newContainer = editor.childNodes[containerIndex];

    $('#editor .active').removeClass('active');
    $(newContainer).addClass('active');
    Editor.setCaretPosition(newContainer, caret.offset);
};

Editor.blur = function(){
    $('#editor .active').removeClass('active');
};

Editor.replaceText = function(node, text, caretOffset){

};

Editor.updateActive = function(){
    $('#editor .active').removeClass('active');
    var range = window.getSelection().getRangeAt(0);
    var editor = document.getElementById('editor');
    for (var node=range.startContainer; node && node.parentElement !== editor; node=node.parentElement);
    $(node).addClass('active');
};


Editor.save = function(){
    if (Editor.saved) return false;

    var data = {
        action: 'save',
        _xsrf: Editor.xsrf(),
        page_name: $('#page_name').val(),
        encrypted: Editor.encrypted,
        public: Editor.public
    };

    // Set the text/cipherJSON
    if (Editor.locked){
        data.text = Editor.cipherJSON;
    } else if (Editor.encrypted){
        var text = Editor.getText();
        var cipherObj = sjcl.encrypt(Editor.password, text);
        Editor.cipherJSON = JSON.stringify(cipherObj);
        data.text = Editor.cipherJSON;
    } else {
        data.text = Editor.getText();
    }
    console.log(data);

    $('#status').text('Saving...');
    $.post(location.href, data, function(response){
        if (response.indexOf('/') === 0){
            window.location.href = response;
        }
        $('#status').text('Saved');
        $('.save').hide();
        Editor.saved = true;
    });
    return false;
};

Editor.saveSettings = function(){
    var options = {};
    $(this)
        .serializeArray()
        .map(function(input){
            options[input.name] = input.value;
        });
    Editor.encrypted = options.encrypted === 'true' ? true : false;
    Editor.public = options.public === 'true' ? true : false;
    Editor.password = options.password;
    Editor.saved = false;
    Editor.save();
    $('#settings_dialog').hide();
    Editor.updateView();
    return false;
};

Editor.lock = function(){
    Editor.locked = true;
    Editor.save();
    $('input[type="password"]').val('');
    Editor.updateView();
    return false;
};

Editor.unlock = function(){
    var $password = $('#decrypt_dialog input[type="password"]');
    var password = $password.val();
    $password.val('');
    var cipherJSON = $.parseJSON(Editor.cipherJSON);
    var text = sjcl.decrypt(password, cipherJSON);
    Editor.container.innerHTML = Editor.textToHTML(text);
    Editor.password = password;
    Editor.locked = false;
    Editor.updateView();
    $('#decrypt_dialog').hide();
    return false;
};

Editor.delete = function(){
    if (confirm('Are you sure?')){
        $('#status').text('Deleting...');
        $.post('', {action: 'delete', _xsrf: Editor.xsrf()}, function(response){
            if (response.indexOf('/') === 0){
                window.location.href = response;
            } else {
                $('#status').text(response);
            }
        });
    }
    return false;
};

Editor.updateView = function(){
    // Shows and hides ui elements based on state
    if (!this.editable){
        $('.controls').hide();
        return;
    }

    if (this.locked){
        $('#editor, .unlocked, .save').hide();
        $('#decrypt_dialog')
            .show()
            .focus();
    } else {
        if (this.encrypted){
            $('.unlocked').css('display', 'inline-block');
        } else {
            $('.unlocked').hide();
        }
        if (this.saved){
            $('.save').css('display', 'inline-block');
        } else {
            $('.save').hide();
        }
        $('#editor').show().focus();
    }
};

Editor.xsrf = function(){
    return /_xsrf=([a-z0-9]+)/.exec(document.cookie)[1];
};

Editor.undo = function(){
    console.log('undo');
    var state = Editor.undoStack.pop();
    if (state){
        var nodes = state[0];
        var range = state[1];
        Editor.setUndoState(nodes, range);
    }
    return false;
};

Editor.redo = function(){
    console.log('redo');
    return false;
};

Editor.saveUndoState = function(){
    console.log('saving undo state')
    var range = window.getSelection().getRangeAt(0);
    var nodes = [];
    for (var i = 0, node; node = this.container.childNodes[i]; i++){
        nodes.push(node);
    }
    var rangeData = {
        collapsed: range.collapsed,
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset
    };
    this.undoStack.push([nodes, rangeData]);
};

Editor.setUndoState = function(nodesB, rangeData){
    //  A B C   D E F
    //  ---->   <----
    //  A B C X D E F
    //
    //  Add: X
    //
    //  A B C D E F
    //  ---->   <--
    //  A B C   E F
    //  Remove D 

    var add = [];
    var remove = [];
    var nodesA = this.container.childNodes;
    var insertBefore = null;
    var end;

    // Find the last matching node from the end
    for (var i = 1; ; i++){
        var nodeA = nodesA[nodesA.length - i];
        var nodeB = nodesB[nodesB.length - i];
        if (nodeA && nodeB && nodeA === nodeB) {
            end = nodeA;
        } else {
            break;
        }
    }

    // Find insertBefore node
    for (var i = 0; ; i++){
        var nodeA = nodesA[i];
        var nodeB = nodesB[i];
        if (nodeA === end || nodeB === end) {
            if (nodeA === end){
                while (nodeB !== end){
                    add.push(nodeB);
                    nodeB = nodesB[++i];
                }
            } else {
                while (nodeA !== end){
                    remove.push(nodeA);
                    nodeA = nodesA[++i];
                }
            }
            break;
        } else if (nodeA === nodeB) {
            insertBefore = nodeA.nextSibling;
        } else {
            add.push(nodeB);
            remove.push(nodeA);
        }
    }

    // Add changed nodes from B to editor
    for (var i = 0, node; node = add[i]; i++) {
        this.container.insertBefore(node, insertBefore);
    }

    // Remove changed nodes from A
    for (var i = 0, node; node = remove[i]; i++) {
        this.container.removeChild(node);
    }

    var sel = window.getSelection();
    var range = document.createRange();
    range.setStart(rangeData.startContainer, rangeData.startOffset);
    range.setEnd(rangeData.endContainer, rangeData.endOffset);
    range.collapse();
    sel.removeAllRanges();
    sel.addRange(range);
};

Editor.isBrNode = function(node){
    return node && (node.textContent || node.innerText) === '\n';
};

Editor.getText = function(){
    var text = '';
    for (var node, i=0; node=this.container.childNodes[i]; i++){
        if (this.isBrNode(node)){
            // BR elements
            text += '\n';
        } else {
            // Block elements (everything but BRs)
            // innerText for IE < 9
            text += (node.textContent || node.innerText);

            // Add a newline if block element is followed by another element
            if (node.nextSibling){
                text += '\n';
            }
        }
    }
    return text;
}

Editor.textToHTML = function(text){
    // Daps to marked.js for the lesson on parsing: https://github.com/chjj/marked
    var html = '';
    var prevBlock = false;
    var cap;

    while (text){
        // New lines
        if (cap = /^\n/.exec(text)){
            text = text.substring(cap[0].length);
            // Skip newline if there are previous and following 
            // are block level elements.
            // a\na        <div>a</div>
            //             <div>a</div>
            // 
            // a\n\na      <div>a</div>
            //             <div><br></div>
            //             <div>a</div>
            var followingBlock = /^\n*[^\n]/.exec(text);
            if (prevBlock && followingBlock){
                // Skip newline
            } else {
                html += '<div class="br"><br></div>';
            }
            prevBlock = false;
            continue;
        }

        prevBlock = true;

        // Headings
        if (cap = /^(#{1,6}\s?)([^\n]*)/.exec(text)){
            text = text.substring(cap[0].length);
            var depth = cap[1].replace(/\s/g, '').length;
            var hashes = cap[1];
            html += '<h' + depth + '><span>' + hashes + '</span>' +
                this.inlineHTML(cap[2]) + '</h' + depth + '>';
            continue;
        }

        // Block quotes
        if (cap = /^(>\s?)([^\n]*)/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<blockquote><span>' + cap[1] + '</span>' + 
                this.inlineHTML(cap[2]) + '</blockquote>';
            continue;
        }

        // Horizontal rules
        if (cap = /^-{4,}/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<div class="hr">' + this.inlineHTML(cap[0]) + '</div>';
            continue;
        }

        // List headers
        if (cap = /^([^\n]+:)(\n|$)/.exec(text)){
            text = text.substring(cap[1].length);
            html += '<div class="lh">' + this.inlineHTML(cap[1]) + '</div>';
            continue;
        }

        // List elements
        if (cap = /^(\s*-\n?)([^\n]*)/.exec(text)){
            text = text.substring(cap[0].length);
            var depth = Math.floor(cap[1].length / 4) + 1;
            html += '<div class="li' + depth + '"><span class="hidden">' + cap[1] + 
                (cap[1][-1] === '-' ? '&nbsp;' : '') + '</span>' +
                (cap[2] ? this.inlineHTML(cap[2]) : '<br>') + '</div>';
            continue;
        }

        // Code blocks
        if (cap = /^```((?:(?!```)[\s\S])+)```/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<pre><span>```</span>' + this.escape(cap[1]) + '<span>```</span></pre>';
            continue;
        }

        // Images
        if (cap = /^https?:\/\/(i\.imgur\.com\/[a-zA-Z0-9]+\.(?:png|jpg|gif))/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<div><span>' + this.escape(cap[0]) + 
                '</span><img src="https://' + this.escape(cap[1]) + '"></div>';
            continue; 
        }

        // Text
        if (cap = /^[^\n]+/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<div>' + this.inlineHTML(cap[0]) + '</div>';
            continue;
        }

        if (text){
            alert('Big problems!!');
        }
    }
    return html;
};

Editor.inlineHTML = function(text){
    var html = '';
    var cap;

    while (text){
        // Inline Links
        if (cap = /^\[([^\n]+)\]\((https?:\/\/[^\s<]+[^<.,:;"')\]\s])\)/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<span>[</span><a href="' + this.escape(cap[2]) + '" rel="nofollow">' + 
                this.escape(cap[1]) + '</a><span>]</span><span>(' + this.escape(cap[2]) + ')</span>';
            continue;
        }

        // Plain Links
        if (cap = /^https?:\/\/[^\s<]+[^<.,:;"')\]\s]/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<a href="' + this.escape(cap[0]) + '" rel="nofollow">' + this.escape(cap[0]) + '</a>';
            continue;
        }

        // Email
        if (cap = /^\S+@[a-z0-9-\.]+[a-z]/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<a class="email" rel="nofollow" href="mailto:' + this.escape(cap[0]) + '">' + 
                this.escape(cap[0]) + '</a>';
            continue;
        }

        // Code
        if (cap = /^`([^`]+)`/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<code><span>`</span>' + this.escape(cap[1]) + '<span>`</span></code>';
            continue;
        }

        // Strong
        if (cap = /^\*\*([^\*]+)\*\*/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<strong><span>**</span>' + this.escape(cap[1]) + '<span>**</span></strong>';
            continue;
        }

        // Em
        if (cap = /^\*([^\*]+)\*/.exec(text)){
            text = text.substring(cap[0].length);
            html += '<em><span>*</span>' + this.escape(cap[1]) + '<span>*</span></em>';
            continue;
        }

        // Text
        html += this.escape(text[0]);
        text = text.substring(1);
    }
    return html;
};

Editor.escape = function(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

Editor.getCaretPosition = function(){
    // Returns the 0-indexed character offset of the caret in the editor
    var range = window.getSelection().getRangeAt(0);
    var editor = document.getElementById('editor');
    var node = range.startContainer;
    var offset = range.startOffset;

    // Traverses up the DOM tree to find the character offset from the editor element.
    if (node.nodeType === 3){
        // Text node: offset == n'th character
        // https://developer.mozilla.org/en-US/docs/Web/API/Range.startOffset
    } else {
        // Non-text node: offset == n'th child node
        node = node.childNodes[offset];
        offset = 0;
    }

    while (node){
        if (node.parentElement === editor){
            break;
        } else if (node.previousSibling){
            node = node.previousSibling;
            if (this.isBrNode(node)){
                offset++;
            } else {
                offset += node.textContent.length;
            }
        } else {
            node = node.parentElement;
        }
    }
    return {node: node, offset: offset};
};

Editor.setCaretPosition = function(node, offset){
    // Sets the caret position on a DOM element
    // Find offset on first-level element
    while (node){
        var textLen = (node.textContent || node.innerText).length;
        if (!this.isBrNode(node)){
            // Add 1 for a newline at the end of block elements
            textLen++;
        }
        if (offset >= textLen){
            offset -= textLen;
        } else {
            break;
        }
        node = node.nextSibling;
    }

    // Now find offset from inner text node
    function findTextNodeOffset(node, offset){
        if (node.nodeType === 3){
            // Text node
            if (offset <= node.nodeValue.length){
                return [node, offset];
            }
            offset -= node.nodeValue.length;
        }

        if (offset === 0){
            return [node, offset];
        }

        if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                var result = findTextNodeOffset(child, offset);
                offset = result[1];
                if (result[0] !== null){
                    return result;
                }
            }
        }
        return [null, offset];
    }
    
    var range = document.createRange();
    var sel = window.getSelection();
    var textNodeOffset = findTextNodeOffset(node, offset);
    range.setStart(textNodeOffset[0], textNodeOffset[1]);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
};



